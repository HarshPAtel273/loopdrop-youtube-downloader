import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { access } from 'node:fs/promises';
import { presets, publicDir, port } from './config.js';
import { JobStore } from './job-store.js';
import { checkDependencies, getVideoPreview, normalizeYouTubeUrl, UserError } from './youtube.js';

export function createApp({ jobStore = new JobStore() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(compression());
  app.use(express.json({ limit: '12kb' }));

  const previewLimiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false });
  const downloadLimiter = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });

  app.get('/api/health', async (_request, response) => {
    const dependencies = await checkDependencies();
    response.status(dependencies.ytDlp && dependencies.ffmpeg ? 200 : 503).json({ ok: dependencies.ytDlp && dependencies.ffmpeg, dependencies });
  });

  app.get('/api/presets', (_request, response) => {
    response.json({ presets: Object.values(presets).map(({ selector: _selector, kind: _kind, ...preset }) => preset) });
  });

  app.post('/api/preview', previewLimiter, async (request, response, next) => {
    try {
      const video = await getVideoPreview(request.body?.url);
      response.json({ video });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/downloads', downloadLimiter, async (request, response, next) => {
    try {
      const url = normalizeYouTubeUrl(request.body?.url);
      const job = await jobStore.create({ url, presetId: request.body?.preset, title: request.body?.title });
      response.status(202).json({ job });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/downloads/:id', (request, response) => {
    const job = jobStore.get(request.params.id);
    if (!job) return response.status(404).json({ error: 'That download has expired or does not exist.' });
    response.json({ job });
  });

  app.get('/api/downloads/:id/file', async (request, response, next) => {
    try {
      const job = jobStore.getInternal(request.params.id);
      if (!job || job.status !== 'ready') throw new UserError('That file is not ready or has expired.', 404);
      await access(job.filePath);
      response.download(job.filePath, job.filename, async (error) => {
        await jobStore.remove(job.id);
        if (error && !response.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(publicDir, { maxAge: '1h', etag: true }));
  app.get('*splat', (_request, response) => response.sendFile('index.html', { root: publicDir }));

  app.use((error, _request, response, _next) => {
    const status = error instanceof UserError ? error.status : 500;
    if (status >= 500) console.error(error);
    response.status(status).json({
      error: error instanceof UserError ? error.message : 'Something went wrong on the server.',
    });
  });

  return app;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createApp().listen(port, () => {
    console.log(`Loopdrop is ready at http://localhost:${port}`);
  });
}
