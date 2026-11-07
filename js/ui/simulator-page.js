// simulator-page.js — wires simulateur.html together.
// Loads the topologies, calls simulate() or simulateScenario() once per "Lancer",
// then only reads the event list.

import { simulate, simulateScenario, appliquerPannes } from '../engine/network.js';
import { createTopologyView } from './topology-view.js';
import { createPlayer } from './player.js';
import { renderHeaders, renderTables, createLog } from './panels.js';
import { createCoach } from './coach.js';
import { bubblesFor, markSeen, resetSeen } from './bubbles.js';
import { save, load } from '../storage.js';
import { predictions } from './predict.js';
import { recordSimulation } from '../progress.js';

const TOPOLOGY_IDS = ['mixte', 'etoile', 'bus', 'anneau', 'maillee'];

const $ = (id) => document.getElementById(id);
const topoSelect = $('topo');
const scenarioSelect = $('scenario');
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
let topo = null;       // topology as written in its file
let scenario = null;   // chosen example (null: free choice of source and destination)
let shown = null;      // topology as drawn: with the breakdowns of the scenario applied
let view = null;
let events = [];
let questions = []; // questions of the current run
let selectedDevice = null; // device clicked in the drawing (null: the active device)
let runInfo = null; // what is being played, for the URL and the "Reprendre" box
const answered = new Set(); // questions already asked in this run
let predicted = []; // « Prédire d'abord » questions of the current run (empty when the mode is off)
const predictBox = $('predict');

/** Draw step i (reads the event list only). */
function render(i, delay) {
  const e = events[i];
  view.show(e, { duration: delay * 0.7 });
  caption.textContent = e.note;
  timeEl.textContent = `t = ${e.t} ms`;
  renderHeaders(headersEl, events, i);
  showTables(i);
  log.show(i);
  // Remembered for the "Reprendre" box of the home page.
  save('dernier-scenario', { topo: topo.id, nom: topo.nom, ...runInfo, etape: i + 1, total: events.length });
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
    // Before "Lancer": the tables as they are at the start (ARP and MAC empty).
    if (!selectedDevice) { tablesEl.replaceChildren(); return; }
    const d = shown.devices.find((x) => x.id === selectedDevice);
    const tables = {};
    if (d.arp) tables.arp = d.arp;
    if (d.macTable) tables.macTable = d.macTable;
    if (d.routes) tables.routes = d.routes;
    const start = [{ device: d.id, tables: { [d.id]: tables } }];
    renderTables(tablesEl, start, 0, shown, d.id,
      selectionHeader(`Tables de ${d.id} au départ, avant l'envoi.`, 'Fermer'));
    return;
  }
  const active = events[i].device;
  const id = selectedDevice ?? active;
  renderTables(tablesEl, events, i, shown, id, id === active ? null
    : selectionHeader(`Tables de ${id} (choisi sur le schéma) à l'étape ${i + 1}.`, `Revenir à l'équipement actif (${active})`));
}

/** Phone layout: show one panel at a time (the tabs are hidden on wide screens). */
function showTab(name) {
  $('panels').dataset.tab = name;
  for (const b of document.querySelectorAll('.tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
}
for (const b of document.querySelectorAll('.tabs [role=tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

/** Click on a device in the drawing (null: back to the active device). */
function pickDevice(id) {
  if (id) showTab('tables');
  selectedDevice = id;
  view.select(id);
  showTables(player.index);
}

/**
 * Cards that must interrupt the run after step i: first the bubbles about what
 * step i just showed, then the questions about what step i + 1 will show.
 */
function interruptionsAfter(i) {
  const cards = [];
  const type = topo.devices.find((d) => d.id === events[i].device)?.type;
  for (const b of bubblesFor(events[i], type)) {
    cards.push({ kind: 'bubble', ...b, onClose: () => markSeen(b.id) });
  }
  const written = questions.filter((q) => q.apresEtape === i + 1 && !answered.has(q));
  for (const q of written) cards.push({ kind: 'question', ...q, onAnswer: () => answered.add(q) });
  if (!written.length) { // a written question takes the place of a prediction
    for (const q of predicted) {
      if (q.apresEtape === i + 1 && !answered.has(q)) {
        // kind last: a prediction has its own `kind` field (arp-cible, switch…) that must not win.
        cards.push({ ...q, kicker: 'Prédiction', kind: 'question', onAnswer: () => answered.add(q) });
      }
    }
  }
  return cards;
}

/** « Prédire d'abord » on or off: questions generated from the event list of the run. */
function updatePredictions() {
  predicted = predictBox.checked && events.length ? predictions(events, shown) : [];
}

/** Pause and show the cards due after step i, if any. */
function interrupt(i) {
  const cards = interruptionsAfter(i);
  if (!cards.length) return;
  const wasPlaying = player.playing;
  player.pause();
  player.lock(true);
  coach.show(cards, () => {
    player.lock(false);
    if (wasPlaying && player.index < events.length - 1) player.play();
  });
}

const player = createPlayer($('player'), (i, { delay, forward }) => {
  render(i, delay);
  if (forward) interrupt(i); // only when moving one step forward (not back, not a jump)
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
  caption.textContent = scenario
    ? 'Cliquez sur « Lancer » pour jouer cet exemple.'
    : 'Choisissez la source et la destination, puis cliquez sur « Lancer ».';
  timeEl.textContent = '';
  headersEl.replaceChildren();
  log.load([]);
  showTables(0);
}

function selectTopology(id, { src = 'PC-A', dst = null, scenarioId = '' } = {}) {
  topo = topologies.get(id);
  topoSelect.value = id;
  $('topo-desc').textContent = topo.description;
  const pcs = topo.devices.filter((d) => d.type === 'pc');
  srcSelect.replaceChildren(...pcs.map((d) => option(d.id, `${d.id} (${d.interfaces[0].ip})`)));
  dstSelect.replaceChildren(...pcs.map((d) => option(d.id, `${d.id} (${d.interfaces[0].ip})`)));
  srcSelect.value = pcs.some((d) => d.id === src) ? src : pcs[0].id;
  dstSelect.value = dst && pcs.some((d) => d.id === dst) ? dst
    : pcs.some((d) => d.id === 'PC-B') ? 'PC-B' : pcs[1].id;
  scenarioSelect.replaceChildren(
    option('', 'Libre : je choisis la source et la destination'),
    ...(topo.scenarios ?? []).map((s) => option(s.id, s.nom)));
  selectScenario(scenarioId);
}

/** Choose an example of the topology ('' = free choice). */
function selectScenario(id) {
  scenario = (topo.scenarios ?? []).find((s) => s.id === id) ?? null;
  scenarioSelect.value = scenario?.id ?? '';
  shown = scenario ? appliquerPannes(topo, scenario.pannes ?? []) : topo;
  srcSelect.disabled = !!scenario;
  dstSelect.disabled = !!scenario;
  if (scenario) {
    srcSelect.value = scenario.envois[0].source;
    dstSelect.value = scenario.envois[0].destination;
  }
  const desc = $('scenario-desc');
  desc.hidden = !scenario;
  desc.textContent = scenario
    ? `${scenario.description}${scenario.envois.length > 1 ? ` (${scenario.envois.map((e) => `${e.source} → ${e.destination}`).join(', puis ')})` : ''}`
    : '';
  selectedDevice = null;
  view = createTopologyView(svg, shown, { onDeviceClick: pickDevice });
  resetPanels();
  checkPair();
}

function checkPair() {
  const same = !scenario && srcSelect.value === dstSelect.value;
  runBtn.disabled = same;
  if (same) caption.textContent = 'La source et la destination doivent être deux machines différentes.';
}

function run({ askAtStart = true } = {}) {
  coach.clear();
  player.lock(false);
  if (scenario) {
    events = simulateScenario(topo, scenario);
    questions = (topo.questions ?? []).filter((q) => q.scenario === scenario.id);
    runInfo = { scenario: scenario.id, scenarioNom: scenario.nom };
    history.replaceState(null, '', `?${new URLSearchParams({ topo: topo.id, scenario: scenario.id })}`);
  } else {
    const src = srcSelect.value;
    const dst = dstSelect.value;
    events = simulate(topo, src, dst);
    questions = (topo.questions ?? []).filter((q) => !q.scenario && q.source === src && q.destination === dst);
    runInfo = { src, dst };
    // Shareable address of this run (no reload).
    history.replaceState(null, '', `?${new URLSearchParams({ topo: topo.id, src, dst })}`);
  }
  recordSimulation(topo.id, scenario?.id ?? null); // for the progression page
  answered.clear();
  updatePredictions();
  log.load(events);
  player.load(events.length);
  if (askAtStart && events.length) interrupt(0); // step 1 is shown by « Lancer », not by a step forward
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
  scenarioSelect.addEventListener('change', () => selectScenario(scenarioSelect.value));
  srcSelect.addEventListener('change', () => { resetPanels(); checkPair(); });
  dstSelect.addEventListener('change', () => { resetPanels(); checkPair(); });
  $('setup').addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  predictBox.checked = load('mode-prediction', false); // off by default: watch first, predict later
  predictBox.addEventListener('change', () => {
    save('mode-prediction', predictBox.checked);
    updatePredictions();
  });
  $('reset-bubbles').addEventListener('click', () => {
    resetSeen();
    $('reset-bubbles').textContent = 'Bulles réactivées ✓';
  });
  openFromUrl();
}

/**
 * Ready-made runs from the address:
 *   simulateur.html?topo=mixte&src=PC-A&dst=PC-B&etape=12
 *   simulateur.html?topo=mixte&scenario=boucle
 */
function openFromUrl() {
  const q = new URLSearchParams(location.search);
  const id = q.get('topo');
  if (!topologies.has(id)) {
    selectTopology(TOPOLOGY_IDS[0]);
    return;
  }
  const scenarioId = (topologies.get(id).scenarios ?? []).some((s) => s.id === q.get('scenario')) ? q.get('scenario') : '';
  selectTopology(id, { src: q.get('src'), dst: q.get('dst'), scenarioId });
  if (!scenarioId && (!q.has('src') || !q.has('dst') || runBtn.disabled)) return;
  const step = Number(q.get('etape'));
  const jump = Number.isInteger(step) && step > 1;
  run({ askAtStart: !jump });
  if (jump) player.go(step - 1); // a jump: no question or bubble on the way
}

init();
