// sheets.js — fiches.html: the 8 revision sheets (one screen each) and the flashcards.
//   fiches.html                 list of sheets
//   fiches.html?fiche=arp       one sheet
//   fiches.html?cartes=arp      flashcards of a theme (?cartes=tout for every card)
//   fiches.html?theme=arp       sheets of that theme (link from the end of a quiz)

import { h, link, button } from './dom.js';
import { loadThemes, loadFiches, loadCartes, loadError } from './content.js';
import { createFlashcards } from './flashcards.js';
import { themeIcon, themeClass } from './theme-icons.js';
import { getProgress } from '../progress.js';
import { startSync } from '../account.js';

startSync(); // logged-in students: progress kept in sync with their account

const $ = (id) => document.getElementById(id);
const app = $('sheets-app');
let themes = [];
let fiches = [];
let cartes = [];
const themeOf = (id) => themes.find((t) => t.id === id);

function show(...nodes) {
  app.replaceChildren(...nodes);
}

function setTab(name) {
  $('tab-fiches').setAttribute('aria-selected', String(name === 'fiches'));
  $('tab-cartes').setAttribute('aria-selected', String(name === 'cartes'));
}

function go(query) {
  history.pushState(null, '', `./fiches.html${query}`);
  route();
}

// ---------- sheets ----------

function sheetList(themeId = null) {
  setTab('fiches');
  const list = themeId ? fiches.filter((f) => f.theme === themeId) : fiches;
  show(
    themeId ? h('p', 'filter-note', `Fiches du thème « ${themeOf(themeId)?.titre} » · `, button('voir toutes les fiches', 'link-inline', () => go(''))) : null,
    h('div', 'cards', list.map((f) => h('article', `card sheet-card ${themeClass(f.theme)}`,
      themeIcon(f.theme),
      h('p', 'card-kicker', themeOf(f.theme)?.titre ?? ''),
      h('h2', 'card-title', f.titre),
      h('p', null, f.essentiel[0]),
      button('Ouvrir la fiche →', 'link-inline card-link', () => go(`?fiche=${f.id}`))))));
}

function sheet(f) {
  setTab('fiches');
  const t = themeOf(f.theme);
  const i = fiches.indexOf(f);
  const prev = fiches[i - 1];
  const next = fiches[i + 1];
  document.title = `${f.titre} — Fiches — PacketLab`;
  show(h('article', `sheet ${themeClass(f.theme)}`,
    h('p', 'card-kicker', t?.titre ?? ''),
    h('div', 'course-head', themeIcon(f.theme), h('h2', null, f.titre)),
    t?.statut === 'a-valider' ? h('p', 'badge-review', 'Contenu à valider par l\'équipe') : null,
    h('section', 'sheet-block',
      h('h3', null, 'L\'essentiel'),
      h('ul', null, f.essentiel.map((e) => h('li', null, e)))),
    h('section', 'sheet-block sheet-example',
      h('h3', null, 'Exemple'),
      h('p', null, f.exemple)),
    h('section', 'sheet-block sheet-trap',
      h('h3', null, 'Le piège'),
      h('p', null, f.piege)),
    h('div', 'quiz-actions',
      link(f.simulateur, f.simulateur.includes('fiabilite') ? 'Voir dans le labo →' : 'Voir dans le simulateur →', 'button primary'),
      link(`./cours.html?theme=${f.theme}`, 'Lire le cours', 'button'),
      link(`./quiz.html?theme=${f.theme}`, 'Faire le quiz', 'button'),
      button('Cartes mémoire du thème', null, () => go(`?cartes=${f.theme}`))),
    h('nav', 'sheet-nav',
      prev ? button(`← ${prev.titre}`, 'link-inline', () => go(`?fiche=${prev.id}`)) : h('span'),
      button('Toutes les fiches', 'link-inline', () => go('')),
      next ? button(`${next.titre} →`, 'link-inline', () => go(`?fiche=${next.id}`)) : h('span'))));
}

// ---------- flashcards ----------

function deckList() {
  setTab('cartes');
  document.title = 'Cartes mémoire — PacketLab';
  const known = getProgress().cartes;
  const decks = themes.map((t) => {
    const ids = cartes.filter((c) => c.theme === t.id).map((c) => c.id);
    const n = (known[t.id] ?? []).filter((id) => ids.includes(id)).length;
    return h('article', `card ${themeClass(t.id)}`,
      themeIcon(t.id),
      h('h2', 'card-title', t.titre),
      h('p', 'quiz-best', `${n} / ${ids.length} cartes sues`),
      button('Réviser →', 'link-inline card-link', () => go(`?cartes=${t.id}`)));
  });
  show(
    h('p', 'filter-note', 'Lisez la question, essayez de répondre de tête, retournez la carte, puis dites honnêtement si vous saviez. ',
      button('Réviser toutes les cartes', 'link-inline', () => go('?cartes=tout'))),
    h('div', 'cards', decks));
}

function deck(themeId) {
  setTab('cartes');
  const list = themeId === 'tout' ? cartes : cartes.filter((c) => c.theme === themeId);
  const title = themeId === 'tout' ? 'Toutes les cartes' : themeOf(themeId)?.titre;
  document.title = `Cartes : ${title} — PacketLab`;
  const box = h('div', null);
  show(h('p', 'filter-note', `Cartes mémoire · ${title} · `, button('autres paquets', 'link-inline', () => go('?cartes='))), box);
  createFlashcards(box, list);
}

// ---------- routing ----------

function route() {
  const q = new URLSearchParams(location.search);
  const fiche = fiches.find((f) => f.id === q.get('fiche'));
  document.title = 'Fiches — PacketLab';
  if (fiche) sheet(fiche);
  else if (q.has('cartes')) {
    const id = q.get('cartes');
    if (id === 'tout' || themeOf(id)) deck(id);
    else deckList();
  } else sheetList(themeOf(q.get('theme')) ? q.get('theme') : null);
  window.scrollTo({ top: 0 });
}

async function init() {
  try {
    [themes, fiches, cartes] = await Promise.all([
      loadThemes().then((d) => d.themes),
      loadFiches().then((d) => d.fiches),
      loadCartes().then((d) => d.cartes),
    ]);
  } catch (err) {
    show(h('p', 'error', loadError(err)));
    return;
  }
  $('tab-fiches').addEventListener('click', () => go(''));
  $('tab-cartes').addEventListener('click', () => go('?cartes='));
  window.addEventListener('popstate', route);
  route();
}

init();
