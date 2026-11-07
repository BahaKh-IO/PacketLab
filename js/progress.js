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
const listeners = new Set();

/** Called after every change (account.js uses it to send the progress to the server). */
export function onProgressChange(listener) {
  listeners.add(listener);
}

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
  for (const listener of listeners) listener(p);
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

/** Replace the saved progress (after a merge with the server); does not notify listeners. */
export function replaceProgress(p) {
  save(KEY, p);
}

const later = (a, b) => ((a ?? '') >= (b ?? '') ? a : b);
const maxMap = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

/**
 * Merge two progress objects (this browser and the account): keep the best of both.
 * Counters take the maximum, flashcards the union, "last score" comes from the most
 * recent attempt. Same result whatever the order, and merging twice changes nothing.
 */
export function mergeProgress(a, b) {
  const x = a ?? empty();
  const y = b ?? empty();
  const out = empty();
  out.maj = later(x.maj, y.maj);
  for (const theme of new Set([...Object.keys(x.quiz), ...Object.keys(y.quiz)])) {
    const qa = x.quiz[theme];
    const qb = y.quiz[theme];
    if (!qa || !qb) { out.quiz[theme] = { ...(qa ?? qb) }; continue; }
    const recent = (qa.date ?? '') >= (qb.date ?? '') ? qa : qb;
    out.quiz[theme] = {
      tentatives: Math.max(qa.tentatives, qb.tentatives),
      meilleur: Math.max(qa.meilleur, qb.meilleur),
      total: recent.total,
      dernier: recent.dernier,
      date: recent.date,
    };
  }
  for (const topo of new Set([...Object.keys(x.simulations), ...Object.keys(y.simulations)])) {
    const sa = x.simulations[topo] ?? { libre: 0, scenarios: {} };
    const sb = y.simulations[topo] ?? { libre: 0, scenarios: {} };
    out.simulations[topo] = { libre: Math.max(sa.libre, sb.libre), scenarios: maxMap(sa.scenarios, sb.scenarios) };
  }
  out.labo = maxMap(x.labo, y.labo);
  for (const theme of new Set([...Object.keys(x.cartes), ...Object.keys(y.cartes)])) {
    out.cartes[theme] = [...new Set([...(x.cartes[theme] ?? []), ...(y.cartes[theme] ?? [])])].sort();
  }
  return out;
}

/** Erase everything (progression page, after confirmation). */
export function resetProgress() {
  remove(KEY);
  return empty();
}
