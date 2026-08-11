import assert from 'node:assert/strict';
import test from 'node:test';
import { getPreset, normalizeYouTubeUrl, UserError } from '../src/youtube.js';

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
