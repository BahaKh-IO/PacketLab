// progress-page.js — progression.html: what the student has done, read from progress.js.
// Summary tiles, a bar chart of the best quiz score per theme (one series, SVG),
// the same numbers as a table, simulations explored, lab runs, flashcards, and a reset.

import { h, link, button } from './dom.js';
import { loadThemes, loadCartes, loadError } from './content.js';
import { getProgress, resetProgress } from '../progress.js';

const NS = 'http://www.w3.org/2000/svg';
const TOPOLOGIES = [['etoile', 'Étoile'], ['bus', 'Bus'], ['anneau', 'Anneau'], ['maillee', 'Maillée'], ['mixte', 'Mixte']];
const app = document.getElementById('progress-app');

function svg(tag, attrs = {}, text = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

/** Horizontal bars: best score (%) per theme. Untried themes have no bar and say so. */
function quizChart(themes, quiz) {
  const rowH = 34;
  const left = 230;
  const width = 640;
  const plotW = width - left - 60;
  const top = 24;
  const height = top + rowH * themes.length + 8;
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'bar-chart', role: 'img',
    'aria-label': 'Meilleur score aux quiz par thème, en pourcentage (détail dans le tableau)' });
  // Recessive grid: 0, 50, 100 %.
  for (const pct of [0, 50, 100]) {
    const x = left + (plotW * pct) / 100;
    chart.append(svg('line', { x1: x, y1: top - 6, x2: x, y2: height - 8, class: 'grid' }));
    chart.append(svg('text', { x, y: top - 10, 'text-anchor': 'middle', class: 'axis' }, `${pct} %`));
  }
  themes.forEach((t, i) => {
    const y = top + i * rowH;
    const r = quiz[t.id];
    chart.append(svg('text', { x: left - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'cat' }, t.titre));
    if (!r) {
      chart.append(svg('text', { x: left + 6, y: y + rowH / 2 + 4, class: 'none' }, 'pas encore tenté'));
      return;
    }
    const pct = Math.round((r.meilleur / r.total) * 100);
    const w = Math.max(4, (plotW * pct) / 100);
    const g = svg('g', { class: 'bar', tabindex: '0' });
    // Hit target: the whole row, bigger than the bar.
    g.append(svg('rect', { x: left, y, width: plotW + 50, height: rowH, class: 'hit' }));
    // Bar anchored on the baseline, rounded 4px at the data end only.
    const bh = rowH - 14;
    const by = y + 7;
    g.append(svg('path', { class: 'mark',
      d: `M${left},${by} h${w - 4} a4,4 0 0 1 4,4 v${bh - 8} a4,4 0 0 1 -4,4 h${-(w - 4)} z` }));
    g.append(svg('text', { x: left + w + 6, y: y + rowH / 2 + 4, class: 'value' }, `${pct} %`));
    g.append(svg('title', {}, `${t.titre} : meilleur score ${r.meilleur} / ${r.total} (${pct} %), ${r.tentatives} essai${r.tentatives > 1 ? 's' : ''}`));
    chart.append(g);
  });
  return chart;
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
    topos = await Promise.all(TOPOLOGIES.map(([id]) => fetch(`./data/topologies/${id}.json`).then((r) => r.json())));
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

  const reset = h('div', 'reset-box');
  const ask = button('Réinitialiser ma progression', null, () => {
    reset.replaceChildren(
      h('p', null, 'Effacer toute la progression enregistrée dans ce navigateur ? Cette action est définitive.'),
      button('Oui, tout effacer', 'danger', () => { resetProgress(); render(); }),
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
    h('section', 'panel progress-section',
      h('h2', null, 'Quiz : meilleur score par thème'),
      quizChart(themes, p.quiz),
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
    h('p', 'muted', p.maj ? `Dernière activité : ${new Date(p.maj).toLocaleString('fr-FR')}. Cette progression est enregistrée dans ce navigateur uniquement.` : 'Aucune activité enregistrée pour l\'instant dans ce navigateur.'),
    reset);
}

render();
