// « Prédire d'abord »: generated questions must be well formed, asked before
// the step that answers them, and their right answer must be what that step shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { simulate, simulateScenario } from '../js/engine/network.js';
import { predictions } from '../js/ui/predict.js';

const dir = new URL('../data/topologies/', import.meta.url);
const load = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8'));

/** What the revealing event (index apresEtape) says the answer is. */
function truth(p, ev) {
  switch (p.kind) {
    case 'arp-cible': return ev.frame.arp.targetIp;
    case 'prochain-saut': return ev.route.prochainSaut ?? ev.frame.ipDst;
    case 'switch': return { forward: "L'envoyer sur un seul port", flood: "L'envoyer sur tous ses autres ports", drop: 'La jeter' }[ev.type];
    case 'ttl': return String(ev.frame.ttl);
    case 'mac-routeur': return ev.frame.macDst;
    case 'station': return { deliver: 'Elle la garde', ignore: "Elle l'ignore", forward: 'Elle la passe à la station suivante' }[ev.type];
    default: throw new Error(p.kind);
  }
}

function check(label, events, topo) {
  const list = predictions(events, topo);
  const keys = new Set();
  for (const p of list) {
    const at = `${label} ${p.kind} ${p.device} @${p.apresEtape}`;
    assert.ok(p.apresEtape >= 1 && p.apresEtape < events.length, `${at}: on a real step`);
    assert.ok(p.choix.length >= 2 && new Set(p.choix).size === p.choix.length, `${at}: distinct choices`);
    assert.equal(p.choix[p.bonne], truth(p, events[p.apresEtape]), `${at}: right answer = what the next step shows`);
    assert.equal(events[p.apresEtape].device, p.device, `${at}: about the device that acts next`);
    // The step on screen when the question is asked must not already show the answer.
    const onScreen = events[p.apresEtape - 1].note;
    const answer = p.choix[p.bonne];
    if (p.kind === 'ttl') assert.ok(!onScreen.includes(`TTL ${answer}`) && !onScreen.includes(`→ ${answer}`), `${at}: not given away`);
    // For the PC's ARP target, step 1 must name the destination (that is the question),
    // but must not tell the decision: direct ARP or through the gateway.
    else if (p.kind === 'arp-cible') assert.ok(!/MAC de|passerelle/.test(onScreen), `${at}: not given away by « ${onScreen} »`);
    // The next hop can be the destination itself, whose IP is always on screen: what must not
    // be shown is the routing decision ("via X", "prochain saut X").
    else if (p.kind === 'prochain-saut') assert.ok(!onScreen.includes(`via ${answer}`) && !onScreen.includes(`prochain saut ${answer}`), `${at}: not given away by « ${onScreen} »`);
    else if (p.kind === 'mac-routeur') assert.ok(!onScreen.includes(answer), `${at}: not given away by « ${onScreen} »`);
    const key = `${p.kind}|${p.device}`;
    assert.ok(!keys.has(key), `${at}: once per kind per device`);
    keys.add(key);
  }
  return list;
}

test('every free run and every scenario gets valid predictions', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const topo = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const pcs = topo.devices.filter((d) => d.type === 'pc').map((d) => d.id);
    for (const s of pcs) for (const d of pcs) if (s !== d) check(`${file} ${s}->${d}`, simulate(topo, s, d), topo);
    for (const sc of topo.scenarios ?? []) check(`${file} ${sc.id}`, simulateScenario(topo, sc), topo);
  }
});

test('mixte PC-A -> PC-B: the expected predictions, in order', () => {
  const topo = load('mixte');
  const list = predictions(simulate(topo, 'PC-A', 'PC-B'), topo);
  assert.deepEqual(list.map((p) => `${p.kind}:${p.device}@${p.apresEtape}`), [
    'arp-cible:PC-A@1', 'switch:SW1@3', 'prochain-saut:R1@11', 'ttl:R1@11',
    'prochain-saut:R2@16', 'ttl:R2@16', 'switch:SW2@19',
  ]);
  const r1 = list.find((p) => p.kind === 'prochain-saut' && p.device === 'R1');
  assert.equal(r1.choix[r1.bonne], '10.0.0.2');
});

test('mixte deuxieme-envoi: the routers MAC destination is asked when it comes from the table', () => {
  const topo = load('mixte');
  const sc = topo.scenarios.find((s) => s.id === 'deuxieme-envoi');
  const list = predictions(simulateScenario(topo, sc), topo);
  const macs = list.filter((p) => p.kind === 'mac-routeur').map((p) => `${p.device}:${p.choix[p.bonne]}`);
  assert.deepEqual(macs, ['R1:22:22:22:00:00:01', 'R2:BB:BB:BB:00:00:0B']);
});

test('bus: stations are asked whether they keep the frame', () => {
  const topo = load('bus');
  const list = predictions(simulate(topo, 'PC-A', 'PC-C'), topo);
  const stations = list.filter((p) => p.kind === 'station').map((p) => `${p.device}:${p.choix[p.bonne]}`);
  assert.deepEqual(stations, ["PC-B:Elle l'ignore", 'PC-C:Elle la garde', "PC-D:Elle l'ignore"]);
});

test('predictions are deterministic', () => {
  const topo = load('maillee');
  const ev = simulate(topo, 'PC-A', 'PC-B');
  assert.deepEqual(predictions(ev, topo), predictions(ev, topo));
});
