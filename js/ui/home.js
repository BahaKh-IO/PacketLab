// home.js — home page: the "Reprendre" box, filled from the last scenario saved by the simulator.

import { load } from '../storage.js';

const last = load('dernier-scenario', null);
if (last && last.topo && (last.scenario || (last.src && last.dst))) {
  const params = new URLSearchParams(last.scenario
    ? { topo: last.topo, scenario: last.scenario }
    : { topo: last.topo, src: last.src, dst: last.dst });
  if (last.etape) params.set('etape', String(last.etape));
  document.getElementById('resume-link').href = `./simulateur.html?${params}`;
  document.getElementById('resume-text').textContent =
    (last.scenario ? `${last.nom ?? last.topo} — ${last.scenarioNom ?? last.scenario}` : `${last.nom ?? last.topo} : ${last.src} → ${last.dst}`) +
    (last.etape ? `, étape ${last.etape} / ${last.total}` : '');
  document.getElementById('resume').hidden = false;
}
