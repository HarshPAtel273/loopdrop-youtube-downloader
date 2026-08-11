import { randomUUID } from 'node:crypto';
import { presets } from './config.js';
import { makeJobDirectory, removeJobDirectory, startYtDlpDownload, UserError } from './youtube.js';

const JOB_TTL_MS = 30 * 60 * 1_000;
const MAX_ACTIVE_DOWNLOADS = 2;

export class JobStore {
  constructor() {
    this.jobs = new Map();
    this.activeDownloads = 0;
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000).unref();
  }

  async create({ url, presetId, title = '' }) {
    if (this.activeDownloads >= MAX_ACTIVE_DOWNLOADS) {
      throw new UserError('Two downloads are already running. Try again in a moment.', 429);
    }

    const preset = presets[presetId];
    if (!preset) throw new UserError('Choose one of the available download formats.');

    const id = randomUUID();
    const directory = await makeJobDirectory(id);
    const job = {
      id,
      status: 'queued',
      progress: 0,
      speed: '',
      eta: '',
      title: String(title).slice(0, 300),
      preset: { id: preset.id, label: preset.label, detail: preset.detail },
      directory,
      filePath: '',
      filename: '',
      error: '',
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.run(job, url, presetId);
    return this.toPublic(job);
  }

  get(id) {
    const job = this.jobs.get(id);
    return job ? this.toPublic(job) : null;
  }

  getInternal(id) {
    return this.jobs.get(id) || null;
  }

  async run(job, url, presetId) {
    this.activeDownloads += 1;
    job.status = 'downloading';
    try {
      const file = await startYtDlpDownload({
        url,
        presetId,
        outputDir: job.directory,
        onProgress: (progress) => Object.assign(job, { ...progress, status: 'downloading' }),
      });
      Object.assign(job, { ...file, status: 'ready', progress: 100, speed: '', eta: '' });
    } catch (error) {
      job.status = 'error';
      job.error = error instanceof UserError ? error.message : 'The download stopped unexpectedly. Try again.';
      await removeJobDirectory(job.directory);
    } finally {
      this.activeDownloads -= 1;
    }
  }

  async remove(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    await removeJobDirectory(job.directory);
  }

  async cleanupExpired() {
    const cutoff = Date.now() - JOB_TTL_MS;
    await Promise.all(
      [...this.jobs.values()]
        .filter((job) => job.createdAt < cutoff && !['queued', 'downloading'].includes(job.status))
        .map((job) => this.remove(job.id)),
    );
  }

  toPublic(job) {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      speed: job.speed,
      eta: job.eta,
      title: job.title,
      preset: job.preset,
      filename: job.status === 'ready' ? job.filename : '',
      error: job.error,
    };
  }
}
