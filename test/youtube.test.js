import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDownloadArgs, friendlyYtDlpError, getPreset, normalizeYouTubeUrl, UserError } from '../src/youtube.js';
import { jsRuntimePath } from '../src/config.js';

test('normalizes supported YouTube URLs and strips fragments', () => {
  assert.equal(
    normalizeYouTubeUrl(' http://youtu.be/BaW_jenozKc?t=4#chapter '),
    'https://youtu.be/BaW_jenozKc?t=4',
  );
  assert.equal(
    normalizeYouTubeUrl('https://music.youtube.com/watch?v=abc123'),
    'https://music.youtube.com/watch?v=abc123',
  );
});

test('rejects unsupported protocols and lookalike hosts', () => {
  for (const url of [
    'file:///etc/passwd',
    'https://youtube.com.evil.example/watch?v=abc',
    'https://example.com/watch?v=abc',
    'not a url',
  ]) {
    assert.throws(() => normalizeYouTubeUrl(url), UserError);
  }
});

test('returns only known format presets', () => {
  assert.equal(getPreset('1080p').kind, 'video');
  assert.equal(getPreset('mp3').kind, 'audio');
  assert.throws(() => getPreset('4k'), UserError);
});

test('download arguments include a bundled JS runtime and a size cap that allows HD videos', () => {
  const args = buildDownloadArgs({
    url: 'https://www.youtube.com/watch?v=HyORX2L-rlk&t=64s',
    presetId: '720p',
    outputDir: '/tmp/loopdrop-test',
  });
  assert.deepEqual(args.slice(0, 3), ['--no-config', '--js-runtimes', `node:${jsRuntimePath}`]);
  assert.ok(args.includes('--progress'));
  assert.equal(args[args.indexOf('--max-filesize') + 1], '2G');
  assert.equal(args[args.indexOf('-f') + 1], getPreset('720p').selector);
});

test('maps downloader failures to specific, readable messages', () => {
  assert.match(friendlyYtDlpError('HTTP Error 403: Forbidden'), /YouTube blocked/);
  assert.match(friendlyYtDlpError('File is larger than max-filesize'), /2 GB/);
  assert.match(friendlyYtDlpError('ERROR: unexpected'), /could not complete/);
});
