// courses.js — cours.html: the list of courses, and one course (cours.html?theme=arp).
// A course is an HTML fragment written by us in cours/<theme>.html; it is inserted
// as HTML because it is our own file, from our own site (never user input).

import { h, link, button } from './dom.js';
import { loadThemes, loadError } from './content.js';

const app = document.getElementById('courses-app');
let data = null;

function show(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo({ top: 0 });
}

function list() {
  document.title = 'Cours — PacketLab';
  show(h('div', 'cards', data.themes.map((t, k) => h('article', 'card',
    h('p', 'card-kicker', `Cours ${k + 1}`),
    h('h2', 'card-title', t.titre),
    h('p', null, t.resume),
    link(`./cours.html?theme=${t.id}`, 'Lire le cours →', 'card-link')))));
}

async function course(theme) {
  let html;
  try {
    const res = await fetch(`./cours/${theme.id}.html`);
    if (!res.ok) throw new Error(`cours/${theme.id}.html : HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    show(h('p', 'error', loadError(err)));
    return;
  }
  document.title = `${theme.titre} — Cours — PacketLab`;
  const i = data.themes.indexOf(theme);
  const prev = data.themes[i - 1];
  const next = data.themes[i + 1];
  const body = h('div', 'course-body');
  body.innerHTML = html; // our own course file (see the comment at the top)
  show(h('article', 'course',
    h('div', 'course-tools no-print',
      link('./cours.html', '← Tous les cours', 'link-inline'),
      button('Imprimer / PDF', null, () => window.print())),
    h('p', 'card-kicker', `Cours ${i + 1} sur ${data.themes.length}`),
    h('h2', 'course-title', theme.titre),
    theme.statut === 'a-valider' ? h('p', 'badge-review', 'Contenu à valider par l\'équipe') : null,
    h('p', 'course-sources', data.sources),
    body,
    h('div', 'quiz-actions no-print',
      link(`./fiches.html?theme=${theme.id}`, 'Fiche et cartes mémoire', 'button'),
      link(`./quiz.html?theme=${theme.id}`, 'Faire le quiz', 'button primary')),
    h('nav', 'sheet-nav no-print',
      prev ? link(`./cours.html?theme=${prev.id}`, `← ${prev.titre}`, 'link-inline') : h('span'),
      next ? link(`./cours.html?theme=${next.id}`, `${next.titre} →`, 'link-inline') : h('span'))));
}

async function init() {
  try {
    data = await loadThemes();
  } catch (err) {
    show(h('p', 'error', loadError(err)));
    return;
  }
  const theme = data.themes.find((t) => t.id === new URLSearchParams(location.search).get('theme'));
  if (theme) course(theme);
  else list();
}

init();
