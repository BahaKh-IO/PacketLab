// Questions asked during a simulation (docs/formats.md, Question):
// each must point to a real step of its run, must not give the answer away,
// and its right answer must match what the engine really does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { simulate } from '../js/engine/network.js';

const dir = new URL('../data/topologies/', import.meta.url);
const load = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8'));
const MAC = /[0-9A-F]{2}(:[0-9A-F]{2}){5}/;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const topo = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  for (const [k, q] of (topo.questions ?? []).entries()) {
    test(`${file} question ${k + 1}: well formed and on a real step`, () => {
      const pcs = topo.devices.filter((d) => d.type === 'pc').map((d) => d.id);
      assert.ok(pcs.includes(q.source) && pcs.includes(q.destination) && q.source !== q.destination);
      const events = simulate(topo, q.source, q.destination);
      // Asked after step apresEtape (1-based), so there must be a next step to discover.
      assert.ok(Number.isInteger(q.apresEtape) && q.apresEtape >= 1 && q.apresEtape < events.length);
      assert.ok(q.enonce.length > 10 && q.explication.length > 10);
      assert.ok(q.choix.length >= 2 && new Set(q.choix).size === q.choix.length, 'distinct choices');
      assert.ok(Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < q.choix.length);
    });
  }
}

/** Index (0-based) of the first event matching `pred`. */
const find = (events, pred) => events.findIndex(pred);

test('mixte Q1: SW1 floods the ARP broadcast (asked before step 4 shows it)', () => {
  const q = load('mixte').questions[0];
  const events = simulate(load('mixte'), q.source, q.destination);
  const i = find(events, (e) => e.device === 'SW1' && (e.type === 'flood' || e.type === 'forward'));
  assert.equal(events[i].type, 'flood');
  assert.ok(i >= q.apresEtape, 'answer not visible yet');
  assert.match(q.choix[q.bonne], /tous ses autres ports/);
});

test('mixte Q2: MAC source after R1 is R1 e1 (asked before R1 sends)', () => {
  const q = load('mixte').questions[1];
  const events = simulate(load('mixte'), q.source, q.destination);
  const i = find(events, (e) => e.type === 'send' && e.device === 'R1');
  assert.ok(i >= q.apresEtape, 'answer not visible yet');
  assert.equal(q.choix[q.bonne].match(MAC)[0], events[i].frame.macSrc);
});

test('mixte Q3: MAC destination after R2 is PC-B (asked before R2 sends)', () => {
  const q = load('mixte').questions[2];
  const events = simulate(load('mixte'), q.source, q.destination);
  const i = find(events, (e) => e.type === 'send' && e.device === 'R2');
  assert.ok(i >= q.apresEtape, 'answer not visible yet');
  assert.equal(q.choix[q.bonne].match(MAC)[0], events[i].frame.macDst);
});

test('maillee Q1: R1 picks the /24 via R2 over the default route (asked before it routes)', () => {
  const topo = load('maillee');
  const q = topo.questions[0];
  const events = simulate(topo, q.source, q.destination);
  const i = find(events, (e) => e.type === 'route' && e.device === 'R1');
  assert.ok(i >= q.apresEtape, 'answer not visible yet');
  assert.equal(events[i].route.masque, 24);
  assert.equal(events[i].route.prochainSaut, '10.0.12.2');
  assert.match(q.choix[q.bonne], /192\.168\.2\.0\/24, via R2/);
});

test('maillee Q2: on the way back R4 sends to R3 (asked before it routes)', () => {
  const topo = load('maillee');
  const q = topo.questions[1];
  const events = simulate(topo, q.source, q.destination);
  const i = find(events, (e) => e.type === 'route' && e.device === 'R4');
  assert.ok(i >= q.apresEtape, 'answer not visible yet');
  const nextHopOwner = topo.devices.find((d) => d.interfaces.some((f) => f.ip === events[i].route.prochainSaut)).id;
  assert.equal(nextHopOwner, 'R3');
  assert.equal(q.choix[q.bonne], 'R3');
});
