// progress.js with a fake localStorage (Node has none).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { getProgress, recordQuiz, recordSimulation, recordLab, setCardKnown, resetProgress } = await import('../js/progress.js');

beforeEach(() => store.clear());

test('empty progress by default', () => {
  assert.deepEqual(getProgress(), { version: 1, maj: null, quiz: {}, simulations: {}, labo: {}, cartes: {} });
});

test('quiz: attempts counted, best score kept, last score updated', () => {
  recordQuiz('arp', 5, 8);
  recordQuiz('arp', 7, 8);
  recordQuiz('arp', 6, 8);
  const q = getProgress().quiz.arp;
  assert.deepEqual([q.tentatives, q.meilleur, q.dernier, q.total], [3, 7, 6, 8]);
  assert.ok(getProgress().maj, 'date of last change');
});

test('simulations, lab runs and flashcards', () => {
  recordSimulation('mixte');
  recordSimulation('mixte', 'boucle');
  recordSimulation('mixte', 'boucle');
  recordLab('comparer');
  setCardKnown('arp', 'arp-c1', true);
  setCardKnown('arp', 'arp-c2', true);
  setCardKnown('arp', 'arp-c1', false);
  const p = getProgress();
  assert.deepEqual(p.simulations.mixte, { libre: 1, scenarios: { boucle: 2 } });
  assert.deepEqual(p.labo, { comparer: 1 });
  assert.deepEqual(p.cartes.arp, ['arp-c2']);
});

test('saved under one key, and reset erases it', () => {
  recordLab('avec');
  assert.ok(store.has('packetlab.progression'));
  resetProgress();
  assert.equal(store.has('packetlab.progression'), false);
  assert.deepEqual(getProgress().labo, {});
});
