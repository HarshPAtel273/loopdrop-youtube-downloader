import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/server.js';

async function withServer(run) {
  const fakeStore = {
    get: () => null,
    getInternal: () => null,
    create: async () => ({ id: 'fake' }),
  };
  const server = createApp({ jobStore: fakeStore }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('serves the app shell and public presets', async () => {
  await withServer(async (origin) => {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Keep the/);

    const response = await fetch(`${origin}/api/presets`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.presets.length, 4);
    assert.equal('selector' in body.presets[0], false);
  });
});

test('rejects non-YouTube download URLs before creating a job', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/video', preset: '720p' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Only youtube/);
  });
});

test('returns a clear response for missing jobs', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/downloads/missing`);
    assert.equal(response.status, 404);
  });
});
