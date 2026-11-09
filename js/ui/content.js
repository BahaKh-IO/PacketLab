// content.js — loads the site's data files (themes, quizzes, fiches, flashcards, topologies, courses).
// Paths are relative to the page, so they work on GitHub Pages and with Live Server.

const RETRY_DELAYS = [400, 1200]; // ms

/**
 * fetch() that tries again twice on a passing failure: a network error, or a server error
 * (5xx, e.g. GitHub Pages answering 503 for a few seconds after a deploy). A 404 is not retried.
 */
export async function fetchWithRetry(path) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(path);
      if (res.status < 500 || attempt >= RETRY_DELAYS.length) return res;
    } catch (err) {
      if (attempt >= RETRY_DELAYS.length) throw err;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
  }
}

async function getJson(path) {
  const res = await fetchWithRetry(path);
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}

export const loadThemes = () => getJson('./data/themes.json');
export const loadQuiz = (themeId) => getJson(`./data/quiz/${themeId}.json`);
export const loadFiches = () => getJson('./data/fiches/fiches.json');
export const loadCartes = () => getJson('./data/fiches/cartes.json');
export const loadTopology = (id) => getJson(`./data/topologies/${id}.json`);

/** Message shown when the content cannot be loaded (usually: page opened with file://). */
export function loadError(err) {
  return `Impossible de charger le contenu (${err.message}). En local, ouvrez le site avec Live Server, pas en double-cliquant sur le fichier.`;
}
