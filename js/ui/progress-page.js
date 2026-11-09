// progress-page.js — progression.html: what the student has done, read from progress.js.
// Summary tiles, one tile per theme (best quiz score as a ring, flashcards known as a bar),
// badges, the quiz numbers as a table, simulations explored, lab runs, and a reset.

import { h, link, button } from './dom.js';
import { themeIcon, themeClass } from './theme-icons.js';
import { loadThemes, loadCartes, loadTopology, loadError } from './content.js';
import { getProgress, resetProgress } from '../progress.js';
import { startSync, accountsEnabled, currentSession, pushReset } from '../account.js';

startSync(); // logged-in students: progress kept in sync with their account

const NS = 'http://www.w3.org/2000/svg';
const TOPOLOGIES = [['etoile', 'Étoile'], ['bus', 'Bus'], ['anneau', 'Anneau'], ['maillee', 'Maillée'], ['mixte', 'Mixte']];
const app = document.getElementById('progress-app');

function svg(tag, attrs = {}, text = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

/** A ring filled to pct % (decorative: the value is written next to it). */
function ring(pct) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const el = svg('svg', { viewBox: '0 0 72 72', class: 'theme-ring', 'aria-hidden': 'true' });
  el.append(svg('circle', { cx: 36, cy: 36, r, class: 'track' }));
  if (pct !== null) el.append(svg('circle', { cx: 36, cy: 36, r, class: 'arc', 'stroke-dasharray': `${(pct / 100) * c} ${c}` }));
  el.append(svg('text', { x: 36, y: 41, 'text-anchor': 'middle' }, pct === null ? '—' : `${pct} %`));
  return el;
}

/** One tile per theme: best quiz score (ring) and flashcards known (bar). */
function themeTiles(themes, quiz, cartes, known) {
  return h('div', 'theme-dash', themes.map((t) => {
    const r = quiz[t.id];
    const pct = r ? Math.round((r.meilleur / r.total) * 100) : null;
    const ids = cartes.filter((c) => c.theme === t.id).map((c) => c.id);
    const n = ids.filter((id) => known.has(id)).length;
    const bar = h('div', 'mini-bar', h('span'));
    bar.firstChild.style.width = `${ids.length ? (n / ids.length) * 100 : 0}%`;
    bar.setAttribute('aria-hidden', 'true');
    return h('article', `card theme-tile ${themeClass(t.id)}`,
      h('div', 'theme-tile-head', themeIcon(t.id), h('h3', null, t.titre)),
      h('div', 'theme-tile-body',
        ring(pct),
        h('div', null,
          h('p', 'tile-line', r ? `Quiz : ${r.meilleur} / ${r.total} au mieux` : 'Quiz pas encore tenté'),
          h('p', 'tile-line', `Cartes : ${n} / ${ids.length} sues`),
          bar)),
      h('p', 'tile-links', link(`./quiz.html?theme=${t.id}`, 'Quiz'), ' · ', link(`./fiches.html?theme=${t.id}`, 'Fiche'), ' · ', link(`./cours.html?theme=${t.id}`, 'Cours')));
  }));
}

// Badge icons, drawn in a 24×24 box.
const BADGE_ICONS = {
  first: 'M4 12 H15 M11 8 L15 12 L11 16 M18 6 V18',
  explorer: 'M12 3 A9 9 0 1 0 12.01 3 M15.5 8.5 L13.5 13.5 L8.5 15.5 L10.5 10.5 Z',
  pannes: 'M6 6 L18 18 M18 6 L6 18 M3 12 H6 M18 12 H21',
  labo: 'M4 15 H8 V19 H4 Z M10 15 H14 V19 H10 Z M16 15 H20 V19 H16 Z M7 11 C9 5 15 5 17 11 M15 9.5 L17 11 L18.5 9',
  parfait: 'M12 3 L14.6 8.8 L21 9.3 L16.2 13.4 L17.7 19.6 L12 16.3 L6.3 19.6 L7.8 13.4 L3 9.3 L9.4 8.8 Z',
  curieux: 'M5 4 H19 V20 H5 Z M8 8 H16 M8 12 H16 M8 16 H12',
  memoire: 'M7 4 H17 A2 2 0 0 1 19 6 V18 A2 2 0 0 1 17 20 H7 A2 2 0 0 1 5 18 V6 A2 2 0 0 1 7 4 Z M9 12 L11 14 L15 10',
  expert: 'M5 9 L12 4 L19 9 L12 14 Z M8 11 V16 C10 18 14 18 16 16 V11 M19 9 V14',
};

function badgeWall(list) {
  return h('ul', 'badges', list.map(([id, name, rule, got]) => {
    const icon = svg('svg', { viewBox: '0 0 24 24', class: 'badge-icon', 'aria-hidden': 'true' });
    icon.append(svg('path', { d: BADGE_ICONS[id] }));
    return h('li', got ? 'badge got' : 'badge',
      h('span', 'badge-medal', icon),
      h('span', 'badge-text', h('strong', null, name), h('span', null, rule),
        h('span', 'badge-state', got ? 'Obtenu' : 'À débloquer')));
  }));
}

function quizTable(themes, quiz) {
  return h('table', 'data-table progress-table',
    h('caption', null, 'Détail des quiz'),
    h('thead', null, h('tr', null, h('th', null, 'Thème'), h('th', null, 'Meilleur'), h('th', null, 'Dernier'), h('th', null, 'Essais'))),
    h('tbody', null, themes.map((t) => {
      const r = quiz[t.id];
      return h('tr', null,
        h('td', null, link(`./quiz.html?theme=${t.id}`, t.titre)),
        h('td', null, r ? `${r.meilleur} / ${r.total}` : '—'),
        h('td', null, r ? `${r.dernier} / ${r.total}` : '—'),
        h('td', null, r ? String(r.tentatives) : '0'));
    })));
}

function tile(value, label) {
  return h('div', 'stat-tile', h('p', 'stat-value', value), h('p', 'stat-label', label));
}

async function render() {
  let themes;
  let cartes;
  let topos;
  try {
    themes = (await loadThemes()).themes;
    cartes = (await loadCartes()).cartes;
    topos = await Promise.all(TOPOLOGIES.map(([id]) => loadTopology(id)));
  } catch (err) {
    app.replaceChildren(h('p', 'error', loadError(err)));
    return;
  }
  const p = getProgress();
  const quizDone = themes.filter((t) => p.quiz[t.id]).length;
  const runs = Object.values(p.simulations).reduce((n, s) => n + s.libre + Object.values(s.scenarios).reduce((a, b) => a + b, 0), 0);
  const allScenarios = topos.flatMap((t) => (t.scenarios ?? []).map((s) => `${t.id}/${s.id}`));
  const explored = allScenarios.filter((k) => { const [t, s] = k.split('/'); return p.simulations[t]?.scenarios[s]; }).length;
  const labRuns = Object.values(p.labo).reduce((a, b) => a + b, 0);
  const known = new Set(Object.values(p.cartes).flat());
  const knownCount = cartes.filter((c) => known.has(c.id)).length;
  const toposTried = TOPOLOGIES.filter(([id]) => {
    const sim = p.simulations[id];
    return sim && sim.libre + Object.values(sim.scenarios).reduce((a, b) => a + b, 0) > 0;
  }).length;
  const perfect = (t) => p.quiz[t.id] && p.quiz[t.id].meilleur === p.quiz[t.id].total;
  const deckDone = themes.some((t) => {
    const ids = cartes.filter((c) => c.theme === t.id).map((c) => c.id);
    return ids.length > 0 && ids.every((id) => known.has(id));
  });
  const badges = [
    ['first', 'Premier voyage', 'Lancer une simulation', runs >= 1],
    ['explorer', 'Explorateur', 'Essayer les 5 topologies', toposTried === TOPOLOGIES.length],
    ['pannes', 'Chasseur de pannes', 'Explorer 10 exemples prêts', explored >= 10],
    ['labo', 'Fiabilité', 'Comparer sans et avec récupération au labo', (p.labo.comparer ?? 0) >= 1],
    ['parfait', 'Sans faute', 'Obtenir 100 % à un quiz', themes.some(perfect)],
    ['curieux', 'Curieux', `Tenter les ${themes.length} quiz`, quizDone === themes.length],
    ['memoire', 'Mémoire vive', "Savoir toutes les cartes d'un thème", deckDone],
    ['expert', 'Expert réseau', `100 % aux ${themes.length} quiz`, themes.every(perfect)],
  ];
  const earned = badges.filter((b) => b[3]).length;

  const reset = h('div', 'reset-box');
  const ask = button('Réinitialiser ma progression', null, () => {
    reset.replaceChildren(
      h('p', null, 'Effacer toute la progression enregistrée dans ce navigateur ? Cette action est définitive.'),
      button('Oui, tout effacer', 'danger', async () => {
        const empty = resetProgress();
        await pushReset(empty).catch(() => {}); // logged in: erase the account's copy too
        render();
      }),
      button('Annuler', null, () => reset.replaceChildren(ask)));
  });
  reset.append(ask);

  app.replaceChildren(
    h('div', 'stat-tiles',
      tile(`${quizDone} / ${themes.length}`, 'thèmes de quiz tentés'),
      tile(String(runs), 'simulations lancées'),
      tile(`${explored} / ${allScenarios.length}`, 'exemples explorés'),
      tile(String(labRuns), 'expériences au Labo fiabilité'),
      tile(`${knownCount} / ${cartes.length}`, 'cartes mémoire sues')),
    h('h2', 'section-title', 'Par thème'),
    themeTiles(themes, p.quiz, cartes, known),
    h('h2', 'section-title', `Badges · ${earned} / ${badges.length}`),
    badgeWall(badges),
    h('section', 'panel progress-section',
      h('h2', null, 'Quiz en chiffres'),
      quizTable(themes, p.quiz)),
    h('section', 'panel progress-section',
      h('h2', null, 'Simulations par topologie'),
      h('table', 'data-table progress-table',
        h('thead', null, h('tr', null, h('th', null, 'Topologie'), h('th', null, 'Envois libres'), h('th', null, 'Exemples explorés'))),
        h('tbody', null, TOPOLOGIES.map(([id, nom], k) => {
          const s = p.simulations[id];
          const list = topos[k].scenarios ?? [];
          const done = list.filter((sc) => s?.scenarios[sc.id]).length;
          return h('tr', null,
            h('td', null, link(`./simulateur.html?topo=${id}`, nom)),
            h('td', null, String(s?.libre ?? 0)),
            h('td', null, `${done} / ${list.length}`));
        })))),
    h('section', 'panel progress-section',
      h('h2', null, 'Labo fiabilité'),
      h('p', null, `Sans récupération : ${p.labo.sans ?? 0} · Avec récupération : ${p.labo.avec ?? 0} · Comparaisons : ${p.labo.comparer ?? 0}`)),
    h('p', 'muted', p.maj ? `Dernière activité : ${new Date(p.maj).toLocaleString('fr-FR')}. ` : 'Aucune activité enregistrée pour l\'instant. ',
      currentSession() ? `Synchronisée avec le compte de ${currentSession().utilisateur.nom}.`
        : accountsEnabled() ? link('./connexion.html', 'Créez un compte pour la retrouver sur tous vos appareils.')
          : 'Enregistrée dans ce navigateur uniquement.'),
    reset);
}

render();
