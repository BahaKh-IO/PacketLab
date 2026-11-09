// Hand-written traces (docs/traces.md): for each topology, what the rules of CLAUDE.md say must
// happen, written from the topology file before looking at the engine — then compared with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, simulateScenario } from '../js/engine/network.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../data/topologies/${id}.json`, import.meta.url), 'utf8'));
const run = (id, src, dst) => simulate(load(id), src, dst);
const scenario = (id, sid) => {
  const topo = load(id);
  return simulateScenario(topo, topo.scenarios.find((s) => s.id === sid));
};

/** Data frames put on a cable: who sent them, with which MACs, IPs and TTL. */
const dataSends = (events) => events
  .filter((e) => e.type === 'send' && e.frame.kind === 'data')
  .map((e) => [e.device, e.frame.macSrc, e.frame.macDst, e.frame.ipSrc, e.frame.ipDst, e.frame.ttl]);
/** ARP requests: who asked, for which IP. */
const arpRequests = (events) => events.filter((e) => e.type === 'arp-request').map((e) => [e.device, e.frame.arp.targetIp]);
const lastTables = (events, id) => events.at(-1).tables[id];

// ---------- star: one switch, same network ----------

test('étoile PC-A -> PC-B: ARP straight for PC-B, switch learns both MACs, then one port only', () => {
  const ev = run('etoile', 'PC-A', 'PC-B');
  assert.deepEqual(arpRequests(ev), [['PC-A', '192.168.1.11']]);
  // the request is flooded to every other port; PC-C and PC-D ignore it
  assert.deepEqual(ev.find((e) => e.type === 'flood' && e.device === 'SW1').links, ['L2', 'L3', 'L4']);
  assert.deepEqual(ev.filter((e) => e.type === 'ignore').map((e) => e.device), ['PC-C', 'PC-D']);
  assert.deepEqual(dataSends(ev), [['PC-A', 'AA:AA:AA:00:00:0A', 'BB:BB:BB:00:00:0B', '192.168.1.10', '192.168.1.11', 64]]);
  // the data frame goes out on p2 only (BB learned from the ARP reply)
  const lastForward = ev.filter((e) => e.type === 'forward' && e.device === 'SW1').at(-1);
  assert.deepEqual(lastForward.links, ['L2']);
  assert.deepEqual(lastTables(ev, 'SW1').macTable, [{ mac: 'AA:AA:AA:00:00:0A', port: 'p1' }, { mac: 'BB:BB:BB:00:00:0B', port: 'p2' }]);
  assert.deepEqual(lastTables(ev, 'PC-A').arp, [{ ip: '192.168.1.11', mac: 'BB:BB:BB:00:00:0B' }]);
  assert.deepEqual(lastTables(ev, 'PC-B').arp, [{ ip: '192.168.1.10', mac: 'AA:AA:AA:00:00:0A' }]); // the target learns the asker
  assert.deepEqual([ev.at(-1).type, ev.at(-1).device, ev.at(-1).frame.ttl], ['deliver', 'PC-B', 64]);
});

// ---------- bus: every station hears every frame ----------

test('bus PC-A -> PC-B: every frame reaches every station, only the addressee keeps it', () => {
  const ev = run('bus', 'PC-A', 'PC-B');
  assert.deepEqual(arpRequests(ev), [['PC-A', '192.168.1.11']]);
  // three frames on the cable (request, reply, data): each time the two others ignore it
  assert.equal(ev.filter((e) => e.type === 'flood' && e.device === 'BUS').length, 3);
  assert.deepEqual(ev.filter((e) => e.type === 'ignore').map((e) => e.device), ['PC-C', 'PC-D', 'PC-C', 'PC-D', 'PC-C', 'PC-D']);
  assert.deepEqual(dataSends(ev), [['PC-A', 'AA:AA:AA:00:00:0A', 'BB:BB:BB:00:00:0B', '192.168.1.10', '192.168.1.11', 64]]);
  assert.equal(lastTables(ev, 'BUS')?.macTable, undefined); // a cable has no table
  // delivered to PC-B (the two other stations ignore it at the same instant, so it is not the last event)
  const delivered = ev.filter((e) => e.type === 'deliver');
  assert.deepEqual(delivered.map((e) => [e.device, e.frame.ttl, e.t]), [['PC-B', 64, ev.at(-1).t]]);
});

// ---------- ring: one direction, A -> B -> C -> D -> A ----------

test('anneau PC-A -> PC-B: the request goes round and comes back to PC-A; the reply goes the long way', () => {
  const ev = run('anneau', 'PC-A', 'PC-B');
  const passes = (op) => ev.filter((e) => e.type === 'forward' && e.frame.kind === 'arp' && e.frame.arp.op === op).map((e) => e.device);
  assert.deepEqual(passes('request'), ['PC-B', 'PC-C', 'PC-D']); // B answers and passes it on
  assert.deepEqual(passes('reply'), ['PC-C', 'PC-D']);           // B -> C -> D -> A, never B -> A
  const back = ev.find((e) => e.type === 'drop' && e.device === 'PC-A');
  assert.equal(back.frame.arp.op, 'request'); // the sender takes its own request off the ring
  assert.deepEqual(dataSends(ev), [['PC-A', 'AA:AA:AA:00:00:0A', 'BB:BB:BB:00:00:0B', '192.168.1.10', '192.168.1.11', 64]]);
  assert.deepEqual([ev.at(-1).type, ev.at(-1).device], ['deliver', 'PC-B']); // A -> B is one hop
});

// ---------- mesh: four routers, the /24 route wins over the default route ----------

test('maillée PC-A -> PC-B: R1 -> R2 -> R4 (longest prefix), TTL 64/63/62/61, MACs rewritten at each router', () => {
  const ev = run('maillee', 'PC-A', 'PC-B');
  assert.deepEqual(arpRequests(ev), [['PC-A', '192.168.1.1'], ['R1', '10.0.12.2'], ['R2', '10.0.24.2'], ['R4', '192.168.2.20']]);
  assert.deepEqual(dataSends(ev), [
    ['PC-A', 'AA:AA:AA:00:00:0A', '11:11:11:00:00:01', '192.168.1.10', '192.168.2.20', 64],
    ['R1', '11:11:11:00:00:02', '22:22:22:00:00:01', '192.168.1.10', '192.168.2.20', 63],
    ['R2', '22:22:22:00:00:02', '44:44:44:00:00:02', '192.168.1.10', '192.168.2.20', 62],
    ['R4', '44:44:44:00:00:01', 'BB:BB:BB:00:00:0B', '192.168.1.10', '192.168.2.20', 61],
  ]);
  const r1 = ev.find((e) => e.type === 'route' && e.device === 'R1').route;
  assert.equal(`${r1.reseau}/${r1.masque} via ${r1.prochainSaut}`, '192.168.2.0/24 via 10.0.12.2'); // not 0.0.0.0/0 via R3
  assert.deepEqual([ev.at(-1).type, ev.at(-1).device, ev.at(-1).frame.ttl], ['deliver', 'PC-B', 61]);
});

test('maillée aller-retour: the answer comes back another way (R4 -> R3 -> R1), R1 needs no ARP', () => {
  const ev = scenario('maillee', 'aller-retour');
  const back = dataSends(ev).filter((s) => s[3] === '192.168.2.20');
  assert.deepEqual(back, [
    ['PC-B', 'BB:BB:BB:00:00:0B', '44:44:44:00:00:01', '192.168.2.20', '192.168.1.10', 64], // PC-B learned R4's MAC from R4's request
    ['R4', '44:44:44:00:00:03', '33:33:33:00:00:02', '192.168.2.20', '192.168.1.10', 63],
    ['R3', '33:33:33:00:00:01', '11:11:11:00:00:03', '192.168.2.20', '192.168.1.10', 62],
    ['R1', '11:11:11:00:00:01', 'AA:AA:AA:00:00:0A', '192.168.2.20', '192.168.1.10', 61], // PC-A known since its request
  ]);
  const secondTrip = arpRequests(ev).slice(arpRequests(ev).findIndex(([d]) => d === 'R4') + 1);
  assert.deepEqual(secondTrip, [['R4', '10.0.34.1'], ['R3', '10.0.13.1']]);
  assert.deepEqual([ev.at(-1).type, ev.at(-1).device, ev.at(-1).frame.ttl], ['deliver', 'PC-A', 61]);
});
