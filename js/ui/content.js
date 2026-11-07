// content.js — loads the learning content (themes, quizzes, fiches, flashcards).
// Paths are relative to the page, so they work on GitHub Pages and with Live Server.

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}

export const loadThemes = () => getJson('./data/themes.json');
export const loadQuiz = (themeId) => getJson(`./data/quiz/${themeId}.json`);
export const loadFiches = () => getJson('./data/fiches/fiches.json');
export const loadCartes = () => getJson('./data/fiches/cartes.json');

/** Message shown when the content cannot be loaded (usually: page opened with file://). */
export function loadError(err) {
  return `Impossible de charger le contenu (${err.message}). En local, ouvrez le site avec Live Server, pas en double-cliquant sur le fichier.`;
}
