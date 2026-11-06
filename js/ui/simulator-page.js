// simulator-page.js — wires simulateur.html together.
// Loads the topologies, calls simulate() once per "Lancer", then only reads the event list.

import { simulate } from '../engine/network.js';
import { createTopologyView } from './topology-view.js';
import { createPlayer } from './player.js';
import { renderHeaders, renderTables, createLog } from './panels.js';
import { createCoach } from './coach.js';
import { bubblesFor, markSeen, resetSeen } from './bubbles.js';

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
const log = createLog($('log'), (k) => { // click on a log line: jump to that step
  if (coach.open) return;
  player.pause();
  player.go(k);
});
const coach = createCoach($('coach'));

const topologies = new Map();
let topo = null;
let view = null;
let events = [];
let questions = []; // questions of the current run
let selectedDevice = null; // device clicked in the drawing (null: the active device)
const answered = new Set(); // questions already asked in this run

/** Draw step i (reads the event list only). */
function render(i, delay) {
  const e = events[i];
  view.show(e, { duration: delay * 0.7 });
  caption.textContent = e.note;
  timeEl.textContent = `t = ${e.t} ms`;
  renderHeaders(headersEl, events, i);
  showTables(i);
  log.show(i);
}

/** Small line above the tables when they belong to a clicked device, not the active one. */
function selectionHeader(text, buttonText) {
  const p = document.createElement('p');
  p.className = 'selection-note';
  p.append(text);
  if (buttonText) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-button';
    b.textContent = buttonText;
    b.addEventListener('click', () => pickDevice(null));
    p.append(' · ', b);
  }
  return p;
}

/** Side panel: tables of the clicked device, or of the device acting at step i. */
function showTables(i) {
  if (!events.length) {
    // Before "Lancer": the tables as written in the topology file (ARP and MAC empty).
    if (!selectedDevice) { tablesEl.replaceChildren(); return; }
    const d = topo.devices.find((x) => x.id === selectedDevice);
    const tables = {};
    if (d.arp) tables.arp = d.arp;
    if (d.macTable) tables.macTable = d.macTable;
    if (d.routes) tables.routes = d.routes;
    const start = [{ device: d.id, tables: { [d.id]: tables } }];
    renderTables(tablesEl, start, 0, topo, d.id,
      selectionHeader(`Tables de ${d.id} au départ, avant l'envoi.`, 'Fermer'));
    return;
  }
  const active = events[i].device;
  const id = selectedDevice ?? active;
  renderTables(tablesEl, events, i, topo, id, id === active ? null
    : selectionHeader(`Tables de ${id} (choisi sur le schéma) à l'étape ${i + 1}.`, `Revenir à l'équipement actif (${active})`));
}

/** Click on a device in the drawing (null: back to the active device). */
function pickDevice(id) {
  selectedDevice = id;
  view.select(id);
  showTables(player.index);
}

/** Questions and bubbles that must interrupt the run after step i. */
function interruptionsAfter(i) {
  const cards = [];
  for (const q of questions) {
    if (q.apresEtape === i + 1 && !answered.has(q)) {
      cards.push({ kind: 'question', ...q, onAnswer: () => answered.add(q) });
    }
  }
  const type = topo.devices.find((d) => d.id === events[i].device)?.type;
  for (const b of bubblesFor(events[i], type)) {
    cards.push({ kind: 'bubble', ...b, onClose: () => markSeen(b.id) });
  }
  return cards;
}

const player = createPlayer($('player'), (i, { delay, forward }) => {
  render(i, delay);
  if (!forward) return; // only when moving one step forward
  const cards = interruptionsAfter(i);
  if (!cards.length) return;
  const wasPlaying = player.playing;
  player.pause();
  player.lock(true);
  coach.show(cards, () => {
    player.lock(false);
    if (wasPlaying && player.index < events.length - 1) player.play();
  });
});

function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

function resetPanels() {
  coach.clear();
  player.lock(false);
  events = [];
  player.load(0);
  view?.clear();
  caption.textContent = 'Choisissez la source et la destination, puis cliquez sur « Lancer ».';
  timeEl.textContent = '';
  headersEl.replaceChildren();
  log.load([]);
  showTables(0);
}

function selectTopology(id, src = 'PC-A', dst = null) {
  topo = topologies.get(id);
  topoSelect.value = id;
  $('topo-desc').textContent = topo.description;
  const pcs = topo.devices.filter((d) => d.type === 'pc');
  srcSelect.replaceChildren(...pcs.map((d) => option(d.id, `${d.id} (${d.interfaces[0].ip})`)));
  dstSelect.replaceChildren(...pcs.map((d) => option(d.id, `${d.id} (${d.interfaces[0].ip})`)));
  srcSelect.value = pcs.some((d) => d.id === src) ? src : pcs[0].id;
  dstSelect.value = dst && pcs.some((d) => d.id === dst) ? dst
    : pcs.some((d) => d.id === 'PC-B') ? 'PC-B' : pcs[1].id;
  selectedDevice = null;
  view = createTopologyView(svg, topo, { onDeviceClick: pickDevice });
  resetPanels();
  checkPair();
}

function checkPair() {
  const same = srcSelect.value === dstSelect.value;
  runBtn.disabled = same;
  if (same) caption.textContent = 'La source et la destination doivent être deux machines différentes.';
}

function run() {
  coach.clear();
  player.lock(false);
  const src = srcSelect.value;
  const dst = dstSelect.value;
  events = simulate(topo, src, dst);
  questions = (topo.questions ?? []).filter((q) => q.source === src && q.destination === dst);
  answered.clear();
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
  $('reset-bubbles').addEventListener('click', () => {
    resetSeen();
    $('reset-bubbles').textContent = 'Bulles réactivées ✓';
  });
  selectTopology(TOPOLOGY_IDS[0]);
}

init();
