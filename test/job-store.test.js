import assert from 'node:assert/strict';
import test from 'node:test';
import { overallProgress } from '../src/job-store.js';

test('multi-stream progress does not jump backward or show complete before merging', () => {
  assert.equal(overallProgress(0, 45), 45);
  assert.equal(overallProgress(99, 5), 99);
  assert.equal(overallProgress(80, 100), 99);
});
