// progress.js — the student's progress ("labs réalisés"), kept in this browser.
// One object, saved under one localStorage key. The backend will later sync
// this same object for logged-in students.
//
// {
//   version: 1,
//   maj: "2026-11-07T10:00:00.000Z",                 // last change (ISO date)
//   quiz: { "<theme>": { tentatives, meilleur, total, dernier, date } },
//   simulations: { "<topo>": { libre: n, scenarios: { "<id>": n } } },
//   labo: { sans: n, avec: n, comparer: n },
//   cartes: { "<theme>": ["<carte id>", ...] }       // flashcards marked as known
// }

import { load, save, remove } from './storage.js';

const KEY = 'progression';

function empty() {
  return { version: 1, maj: null, quiz: {}, simulations: {}, labo: {}, cartes: {} };
}

/** Current progress (a fresh copy: changing it does not save anything). */
export function getProgress() {
  const p = load(KEY, null);
  if (!p || p.version !== 1) return empty();
  return { ...empty(), ...p };
}

function update(change) {
  const p = getProgress();
  change(p);
  p.maj = new Date().toISOString();
  save(KEY, p);
  return p;
}

/** A finished quiz: score out of total. Keeps the number of attempts and the best score. */
export function recordQuiz(theme, score, total) {
  return update((p) => {
    const q = p.quiz[theme] ?? { tentatives: 0, meilleur: 0, total, dernier: 0, date: null };
    q.tentatives += 1;
    q.total = total;
    q.dernier = score;
    q.meilleur = Math.max(q.meilleur, score);
    q.date = new Date().toISOString();
    p.quiz[theme] = q;
  });
}

/** A simulation launched: free run (scenario null) or one of the topology's examples. */
export function recordSimulation(topo, scenario = null) {
  return update((p) => {
    const s = p.simulations[topo] ?? { libre: 0, scenarios: {} };
    if (scenario) s.scenarios[scenario] = (s.scenarios[scenario] ?? 0) + 1;
    else s.libre += 1;
    p.simulations[topo] = s;
  });
}

/** A Labo fiabilité run: mode is 'sans', 'avec' or 'comparer'. */
export function recordLab(mode) {
  return update((p) => {
    p.labo[mode] = (p.labo[mode] ?? 0) + 1;
  });
}

/** Flashcard marked as known (true) or to review again (false). */
export function setCardKnown(theme, cardId, known) {
  return update((p) => {
    const set = new Set(p.cartes[theme] ?? []);
    if (known) set.add(cardId);
    else set.delete(cardId);
    p.cartes[theme] = [...set];
  });
}

/** Erase everything (progression page, after confirmation). */
export function resetProgress() {
  remove(KEY);
  return empty();
}
