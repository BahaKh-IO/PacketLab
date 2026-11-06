// simulator-page.js — wires simulateur.html together.
// Loads the topologies, calls simulate() once per "Lancer", then only reads the event list.

import { simulate } from '../engine/network.js';
import { createTopologyView } from './topology-view.js';
import { createPlayer } from './player.js';
import { renderHeaders, renderTables, createLog } from './panels.js';

const TOPOLOGY_IDS = ['mixte', 'etoile', 'bus', 'anneau', 'maillee'];

const $ = (id) => document.getElementById(id);
const topoSelect = $('topo');
const srcSelect = $('src');
const dstSelect = $('dst');
const runBtn = $('run');
const svg = $('topology');
const caption = $('caption');
const timeEl = $('sim-time');
const headersEl = $('headers');
const tablesEl = $('tables');
const log = createLog($('log'));

const topologies = new Map();
let topo = null;
let view = null;
let events = [];

const player = createPlayer($('player'), (i) => {
  const e = events[i];
  view.show(e);
  caption.textContent = e.note;
  timeEl.textContent = `t = ${e.t} ms`;
  renderHeaders(headersEl, events, i);
  renderTables(tablesEl, events, i, topo);
  log.show(i);
});

function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

function resetPanels() {
  events = [];
  player.load(0);
  view?.clear();
  caption.textContent = 'Choisissez la source et la destination, puis cliquez sur « Lancer ».';
  timeEl.textContent = '';
  headersEl.replaceChildren();
  tablesEl.replaceChildren();
  log.load([]);
}

function selectTopology(id) {
  topo = topologies.get(id);
  $('topo-desc').textContent = topo.description;
  const pcs = topo.devices.filter((d) => d.type === 'pc');
  srcSelect.replaceChildren(...pcs.map((d) => option(d.id, `${d.id} (${d.interfaces[0].ip})`)));
  dstSelect.replaceChildren(...pcs.map((d) => option(d.id, `${d.id} (${d.interfaces[0].ip})`)));
  srcSelect.value = 'PC-A';
  dstSelect.value = pcs.some((d) => d.id === 'PC-B') ? 'PC-B' : pcs[1].id;
  view = createTopologyView(svg, topo);
  resetPanels();
  checkPair();
}

function checkPair() {
  const same = srcSelect.value === dstSelect.value;
  runBtn.disabled = same;
  if (same) caption.textContent = 'La source et la destination doivent être deux machines différentes.';
}

function run() {
  events = simulate(topo, srcSelect.value, dstSelect.value);
  log.load(events);
  player.load(events.length);
}

async function init() {
  try {
    for (const id of TOPOLOGY_IDS) {
      const res = await fetch(`./data/topologies/${id}.json`);
      if (!res.ok) throw new Error(`${id}.json : HTTP ${res.status}`);
      topologies.set(id, await res.json());
    }
  } catch (err) {
    const box = $('error');
    box.hidden = false;
    box.textContent = `Impossible de charger les topologies (${err.message}). ` +
      'En local, ouvrez le site avec Live Server, pas en double-cliquant sur le fichier.';
    return;
  }
  topoSelect.replaceChildren(...TOPOLOGY_IDS.map((id) => option(id, topologies.get(id).nom)));
  topoSelect.addEventListener('change', () => selectTopology(topoSelect.value));
  srcSelect.addEventListener('change', () => { resetPanels(); checkPair(); });
  dstSelect.addEventListener('change', () => { resetPanels(); checkPair(); });
  $('setup').addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  selectTopology(TOPOLOGY_IDS[0]);
}

init();
