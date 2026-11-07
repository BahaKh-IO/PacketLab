// progress.js with a fake localStorage (Node has none).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { getProgress, recordQuiz, recordSimulation, recordLab, setCardKnown, resetProgress, mergeProgress, onProgressChange } = await import('../js/progress.js');

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

test('merge: best of both devices, same result in any order, idempotent', () => {
  const pc = { version: 1, maj: '2026-11-07T10:00:00Z', labo: { avec: 2 }, cartes: { arp: ['arp-c1'] },
    quiz: { arp: { tentatives: 3, meilleur: 6, total: 8, dernier: 6, date: '2026-11-07T10:00:00Z' } },
    simulations: { mixte: { libre: 4, scenarios: { boucle: 1 } } } };
  const phone = { version: 1, maj: '2026-11-07T12:00:00Z', labo: { avec: 1, sans: 1 }, cartes: { arp: ['arp-c2'], ttl: ['rt-c6'] },
    quiz: { arp: { tentatives: 1, meilleur: 5, total: 8, dernier: 5, date: '2026-11-07T12:00:00Z' }, routage: { tentatives: 1, meilleur: 8, total: 8, dernier: 8, date: '2026-11-07T12:00:00Z' } },
    simulations: { mixte: { libre: 1, scenarios: { reponse: 2 } } } };
  const m = mergeProgress(pc, phone);
  assert.deepEqual(m.quiz.arp, { tentatives: 3, meilleur: 6, total: 8, dernier: 5, date: '2026-11-07T12:00:00Z' });
  assert.deepEqual(m.quiz.routage.meilleur, 8);
  assert.deepEqual(m.simulations.mixte, { libre: 4, scenarios: { boucle: 1, reponse: 2 } });
  assert.deepEqual(m.labo, { avec: 2, sans: 1 });
  assert.deepEqual(m.cartes, { arp: ['arp-c1', 'arp-c2'], ttl: ['rt-c6'] });
  assert.equal(m.maj, '2026-11-07T12:00:00Z');
  assert.deepEqual(mergeProgress(phone, pc), m, 'order does not matter');
  assert.deepEqual(mergeProgress(m, phone), m, 'merging again changes nothing');
  assert.deepEqual(mergeProgress(null, pc).quiz, pc.quiz, 'empty side');
});

test('listeners are told about every change', () => {
  const seen = [];
  onProgressChange((p) => seen.push(Object.keys(p.labo).join()));
  recordLab('sans');
  assert.deepEqual(seen.at(-1), 'sans');
});
