// fetchWithRetry: a passing server error (GitHub Pages 503) or network error is retried, a 404 is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from '../js/ui/content.js';

/** Replace fetch by a list of answers (a number = HTTP status, 'down' = network error). */
function fakeFetch(answers) {
  const calls = [];
  globalThis.fetch = async (path) => {
    calls.push(path);
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a === 'down') throw new TypeError('Failed to fetch');
    return { status: a, ok: a >= 200 && a < 300 };
  };
  return calls;
}

test('fetchWithRetry: 503 then 200 -> retried, succeeds', async () => {
  const calls = fakeFetch([503, 200]);
  const res = await fetchWithRetry('./data/x.json');
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test('fetchWithRetry: network error twice then 200 -> succeeds on the third try', async () => {
  const calls = fakeFetch(['down', 'down', 200]);
  const res = await fetchWithRetry('./data/x.json');
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
});

test('fetchWithRetry: 404 is not retried', async () => {
  const calls = fakeFetch([404, 200]);
  const res = await fetchWithRetry('./data/x.json');
  assert.equal(res.status, 404);
  assert.equal(calls.length, 1);
});

test('fetchWithRetry: still 503 after 3 tries -> gives the 503 to the page (which shows its error)', async () => {
  const calls = fakeFetch([503]);
  const res = await fetchWithRetry('./data/x.json');
  assert.equal(res.status, 503);
  assert.equal(calls.length, 3);
});
