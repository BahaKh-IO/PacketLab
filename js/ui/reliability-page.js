// reliability-page.js — wires fiabilite.html together.
// Builds the incident script, calls simulateReliability() once per mode on "Lancer",
// then only replays its output, moment by moment, with the shared player.

import { simulateReliability, decouper, DEFAULTS } from '../engine/reliability.js';
import { createLane, renderResults, visible } from './reliability-view.js';
import { createPlayer } from './player.js';
import { recordLab } from '../progress.js';
import { startSync } from '../account.js';

startSync(); // logged-in students: progress kept in sync with their account

const LABELS = { sans: 'Sans récupération', avec: 'Avec récupération (ACK + délai d\'attente)' };
// Click on a chunk: normal -> perdu -> retard court -> retard long -> normal.
const CYCLE = ['normal', 'perdre', 'court', 'long'];
const INCIDENT = {
  perdre: { action: 'perdre', label: 'perdu' },
  court: { action: 'retarder', delai: 60, label: 'retard 60 ms' },
  long: { action: 'retarder', delai: 300, label: 'retard 300 ms' },
};

const $ = (id) => document.getElementById(id);
const messageInput = $('message');
const tailleSelect = $('taille');
const chipsEl = $('chips');
const lanesEl = $('lanes');
const resultsEl = $('results');
const timeEl = $('lab-time');

const script = new Map([[3, 'perdre']]); // ready for the demo of § 18: chunk 3 lost
let runs = [];
let lanes = [];
let instants = [];

function mode() {
  return document.querySelector('input[name=mode]:checked').value;
}

/** The chunk buttons used to write the incident script. */
function renderChips() {
  const morceaux = decouper(messageInput.value, Number(tailleSelect.value));
  for (const n of [...script.keys()]) if (n > morceaux.length) script.delete(n);
  chipsEl.replaceChildren(...morceaux.map((m) => {
    const state = script.get(m.numero) ?? 'normal';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip chip-${state}`;
    const label = state === 'normal' ? 'normal' : INCIDENT[state].label;
    b.setAttribute('aria-label', `Morceau ${m.numero} « ${m.texte} » : ${label}. Cliquer pour changer.`);
    b.title = 'Cliquer : normal → perdu → retard court → retard long';
    const num = document.createElement('span');
    num.className = 'chip-num';
    num.textContent = m.numero;
    const txt = document.createElement('span');
    txt.className = 'chip-text';
    txt.textContent = visible(m.texte);
    const st = document.createElement('span');
    st.className = 'chip-state';
    st.textContent = label;
    b.append(num, txt, st);
    b.addEventListener('click', () => {
      const next = CYCLE[(CYCLE.indexOf(state) + 1) % CYCLE.length];
      if (next === 'normal') script.delete(m.numero);
      else script.set(m.numero, next);
      renderChips();
      chipsEl.children[m.numero - 1].focus();
    });
    return b;
  }));
  $('run').disabled = morceaux.length === 0;
}

function incidents() {
  return [...script].map(([morceau, state]) => {
    const { action, delai } = INCIDENT[state];
    return action === 'retarder' ? { morceau, action, delai } : { morceau, action };
  });
}

const player = createPlayer($('player'), (i, { delay, forward }) => {
  const T = instants[i];
  const fromT = forward ? instants[i - 1] : T;
  const last = i === instants.length - 1;
  lanes.forEach((lane) => lane.show(T, fromT, delay * 0.85, last));
  timeEl.textContent = `t = ${T} ms`;
  resultsEl.hidden = !last;
}, { baseDelay: 900 });

function run() {
  recordLab(mode()); // for the progression page
  const modes = mode() === 'comparer' ? ['sans', 'avec'] : [mode()];
  const params = { message: messageInput.value, taille: Number(tailleSelect.value), incidents: incidents() };
  runs = modes.map((m) => simulateReliability({ ...params, mode: m }));
  // One step per moment where something happens, on the clock shared by every lane.
  instants = [...new Set([0, ...runs.flatMap((r) => r.events.map((e) => e.t))])].sort((a, b) => a - b);
  lanesEl.className = modes.length > 1 ? 'lanes lanes-2' : 'lanes';
  lanesEl.replaceChildren();
  lanes = runs.map((r) => {
    const box = document.createElement('section');
    box.className = `lane lane-${r.result.mode}`;
    lanesEl.append(box);
    return createLane(box, r, LABELS[r.result.mode]);
  });
  renderResults($('results-table'), runs, LABELS);
  player.load(instants.length);
}

$('delai-attente').textContent = DEFAULTS.delaiAttente;
messageInput.addEventListener('input', renderChips);
tailleSelect.addEventListener('change', renderChips);
$('setup').addEventListener('submit', (e) => {
  e.preventDefault();
  run();
});
renderChips();
