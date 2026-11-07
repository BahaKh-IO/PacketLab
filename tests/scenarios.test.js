// Scenarios: several examples per topology (docs/formats.md, Scenario and Panne).
// Generic checks for every scenario, then one test per lesson a scenario teaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { simulateScenario, appliquerPannes, simulate } from '../js/engine/network.js';

const dir = new URL('../data/topologies/', import.meta.url);
const load = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8'));
const scenario = (topo, id) => topo.scenarios.find((s) => s.id === id);
const run = (topoId, id) => {
  const topo = load(topoId);
  return simulateScenario(topo, scenario(topo, id));
};
const count = (events, type, device) => events.filter((e) => e.type === type && (!device || e.device === device)).length;
const delivered = (events) => events.filter((e) => e.type === 'deliver').map((e) => e.device);

// ---------- every scenario ----------

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const topo = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  const list = topo.scenarios ?? [];
  test(`${file}: scenarios are well formed and run`, () => {
    assert.ok(list.length >= 2, 'at least two examples per topology');
    assert.equal(new Set(list.map((s) => s.id)).size, list.length, 'unique ids');
    const pcs = new Set(topo.devices.filter((d) => d.type === 'pc').map((d) => d.id));
    for (const s of list) {
      assert.ok(s.nom.length > 5 && s.description.length > 20, `${s.id}: nom and description`);
      assert.ok(s.envois.length >= 1, `${s.id}: at least one send`);
      for (const e of s.envois) assert.ok(pcs.has(e.source) && pcs.has(e.destination) && e.source !== e.destination, `${s.id}: send`);
      appliquerPannes(topo, s.pannes); // throws on an unknown device, route or link
      const a = simulateScenario(topo, s);
      assert.deepEqual(simulateScenario(topo, s), a, `${s.id}: same input, same events`);
      assert.equal(count(a, 'start'), s.envois.length, `${s.id}: one start per send`);
      for (let i = 1; i < a.length; i++) assert.ok(a[i].t >= a[i - 1].t, `${s.id}: time order`);
    }
  });
}

test('appliquerPannes never changes the original topology', () => {
  const topo = load('mixte');
  const copy = structuredClone(topo);
  for (const s of topo.scenarios) simulateScenario(topo, s);
  assert.deepEqual(topo, copy);
});

test('a one-send scenario without breakdown gives the same events as simulate()', () => {
  const topo = load('mixte');
  assert.deepEqual(simulateScenario(topo, { envois: [{ source: 'PC-A', destination: 'PC-B' }] }), simulate(topo, 'PC-A', 'PC-B'));
});

// ---------- second send and reply: tables stay filled ----------

test('etoile deuxieme-envoi: the second packet needs no ARP and no flooding', () => {
  const ev = run('etoile', 'deuxieme-envoi');
  assert.deepEqual(delivered(ev), ['PC-B', 'PC-B']);
  const secondStart = ev.findIndex((e, i) => e.type === 'start' && i > 0);
  const second = ev.slice(secondStart);
  assert.equal(count(second, 'arp-request'), 0);
  assert.equal(count(second, 'flood'), 0);
  assert.match(second.find((e) => e.type === 'send').note, /déjà dans sa table ARP/);
});

test('etoile reponse: PC-B answers without ARP (it learned PC-A from the request)', () => {
  const ev = run('etoile', 'reponse');
  assert.deepEqual(delivered(ev), ['PC-B', 'PC-A']);
  assert.equal(count(ev, 'arp-request', 'PC-B'), 0);
});

test('etoile autre-pc: PC-C must do its own ARP, but the switch already knows PC-B', () => {
  const ev = run('etoile', 'autre-pc');
  assert.equal(count(ev, 'arp-request', 'PC-C'), 1);
  const reply = ev.find((e) => e.type === 'arp-reply' && e.device === 'PC-B' && e.frame.macDst === 'CC:CC:CC:00:00:0C');
  const after = ev.slice(ev.indexOf(reply));
  assert.equal(after.find((e) => e.device === 'SW1' && (e.type === 'forward' || e.type === 'flood')).type, 'forward');
});

test('mixte reponse: the way back needs no ARP at all, MACs rewritten the other way', () => {
  const ev = run('mixte', 'reponse');
  assert.deepEqual(delivered(ev), ['PC-B', 'PC-A']);
  const back = ev.slice(ev.findIndex((e, i) => e.type === 'start' && i > 0));
  assert.equal(count(back, 'arp-request'), 0);
  const sends = back.filter((e) => e.type === 'send').map((e) => [e.device, e.frame.macSrc, e.frame.macDst, e.frame.ttl]);
  assert.deepEqual(sends, [
    ['PC-B', 'BB:BB:BB:00:00:0B', '22:22:22:00:00:02', 64],
    ['R2', '22:22:22:00:00:01', '11:11:11:00:00:02', 63],
    ['R1', '11:11:11:00:00:01', 'AA:AA:AA:00:00:0A', 62],
  ]);
});

test('mixte deuxieme-envoi: second packet goes straight through, same MACs per segment', () => {
  const ev = run('mixte', 'deuxieme-envoi');
  const second = ev.slice(ev.findIndex((e, i) => e.type === 'start' && i > 0));
  assert.equal(count(second, 'arp-request'), 0);
  assert.deepEqual(second.filter((e) => e.type === 'send').map((e) => e.frame.ttl), [64, 63, 62]);
});

test('anneau reponse: the reply keeps the same direction (C -> D -> A)', () => {
  const ev = run('anneau', 'reponse');
  const back = ev.slice(ev.findIndex((e, i) => e.type === 'start' && i > 0));
  const path = back.filter((e) => e.frame?.kind === 'data' && e.type !== 'start').map((e) => e.device);
  assert.deepEqual(path, ['PC-C', 'PC-D', 'PC-A']);
});

test('maillee aller-retour: out by R2, back by R3, as the tables say', () => {
  const ev = run('maillee', 'aller-retour');
  assert.deepEqual(ev.filter((e) => e.type === 'route').map((e) => e.device), ['R1', 'R2', 'R4', 'R4', 'R3', 'R1']);
});

// ---------- breakdowns ----------

test('mixte mauvaise-passerelle: nobody answers the ARP for 192.168.1.254', () => {
  const ev = run('mixte', 'mauvaise-passerelle');
  assert.deepEqual(delivered(ev), []);
  assert.equal(ev.find((e) => e.type === 'arp-request').frame.arp.targetIp, '192.168.1.254');
  assert.match(ev.at(-1).note, /Personne n'a répondu/);
  assert.equal(count(ev, 'route'), 0, 'the packet never leaves the first LAN');
});

test('mixte mauvais-masque: with /16, PC-A ARPs for PC-B directly', () => {
  const ev = run('mixte', 'mauvais-masque');
  assert.match(ev[0].note, /192\.168\.0\.0\/16/);
  assert.equal(ev.find((e) => e.type === 'arp-request').frame.arp.targetIp, '192.168.2.20');
  assert.deepEqual(delivered(ev), []);
});

test('mixte route-manquante: R1 has no route and drops the packet', () => {
  const ev = run('mixte', 'route-manquante');
  assert.equal(ev.at(-1).device, 'R1');
  assert.match(ev.at(-1).note, /aucune route/);
});

test('mixte boucle: the packet bounces between R1 and R2 until TTL 0', () => {
  const ev = run('mixte', 'boucle');
  const routes = ev.filter((e) => e.type === 'route').map((e) => `${e.device}:${e.frame.ttl}`);
  assert.deepEqual(routes, ['R1:7', 'R2:6', 'R1:5', 'R2:4', 'R1:3', 'R2:2', 'R1:1']);
  assert.equal(ev.at(-1).type, 'drop');
  assert.equal(ev.at(-1).frame.ttl, 0);
});

test('mixte cable-sw2: frames on the unplugged cable are lost, then nobody answers R2', () => {
  const ev = run('mixte', 'cable-sw2');
  assert.ok(ev.some((e) => e.type === 'drop' && /câble L5 est débranché/.test(e.note)));
  assert.match(ev.at(-1).note, /Personne n'a répondu à la requête ARP de R2/);
});

test('maillee route-supprimee: R1 falls back on its default route, via R3', () => {
  const ev = run('maillee', 'route-supprimee');
  const r1 = ev.find((e) => e.type === 'route' && e.device === 'R1');
  assert.deepEqual(r1.route, { reseau: '0.0.0.0', masque: 0, prochainSaut: '10.0.13.2', interface: 'e2' });
  assert.deepEqual(ev.filter((e) => e.type === 'route').map((e) => e.device), ['R1', 'R3', 'R4']);
  assert.deepEqual(delivered(ev), ['PC-B']);
});

test('maillee lien-r1-r2-coupe: the static route still points to R2, so the packet is lost', () => {
  const ev = run('maillee', 'lien-r1-r2-coupe');
  assert.deepEqual(delivered(ev), []);
  assert.ok(ev.some((e) => e.type === 'drop' && /câble L4/.test(e.note)));
});

test('anneau cable-coupe and etoile cable-pc-b: an unplugged cable isolates the station', () => {
  for (const [topo, id] of [['anneau', 'cable-coupe'], ['etoile', 'cable-pc-b']]) {
    const ev = run(topo, id);
    assert.deepEqual(delivered(ev), [], `${topo}/${id}`);
    assert.match(ev.at(-1).note, /Personne n'a répondu/);
  }
});

test('scenario questions are asked before the step that answers them', () => {
  const checks = [
    ['mixte', 'mauvaise-passerelle', (ev) => ev.findIndex((e) => /Personne n'a répondu/.test(e.note))],
    ['mixte', 'mauvais-masque', (ev) => ev.findIndex((e) => /Personne n'a répondu/.test(e.note))],
    ['mixte', 'boucle', (ev) => ev.findIndex((e) => e.type === 'drop')],
    ['maillee', 'route-supprimee', (ev) => ev.findIndex((e) => e.type === 'route' && e.device === 'R1')],
    ['anneau', 'cable-coupe', (ev) => ev.findIndex((e) => /câble L2/.test(e.note))],
  ];
  for (const [topoId, id, answerIndex] of checks) {
    const topo = load(topoId);
    const q = topo.questions.find((x) => x.scenario === id);
    const ev = simulateScenario(topo, scenario(topo, id));
    assert.ok(answerIndex(ev) >= q.apresEtape, `${topoId}/${id}: answer not visible yet`);
  }
});
