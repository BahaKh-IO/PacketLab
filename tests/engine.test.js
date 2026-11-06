// Engine tests: scheduler order, PC/ARP/switch/router rules, worked example § 7.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scheduler } from '../js/engine/scheduler.js';
import { simulate, longestPrefixMatch, BROADCAST } from '../js/engine/network.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../data/topologies/${id}.json`, import.meta.url), 'utf8'));
const dataSends = (events) => events.filter((e) => e.type === 'send' && e.frame.kind === 'data');

// ---------- scheduler ----------

test('scheduler: sorted by time, ties by insertion order', () => {
  const s = new Scheduler();
  const order = [];
  s.at(20, () => order.push('c'));
  s.at(10, () => order.push('a'));
  s.at(20, () => order.push('d'));
  s.at(10, () => {
    order.push('b');
    s.after(10, () => order.push('e')); // t = 20, scheduled last among t = 20
  });
  s.at(5, () => order.push('first'));
  s.run();
  assert.deepEqual(order, ['first', 'a', 'b', 'c', 'd', 'e']);
  assert.equal(s.now, 20);
});

// ---------- worked example § 7.1 (mixte) ----------

test('mixte PC-A -> PC-B: worked example of § 7.1 (MACs per segment, TTL 64/63/62)', () => {
  const events = simulate(load('mixte'), 'PC-A', 'PC-B');
  const segments = dataSends(events).map((e) => ({
    device: e.device, macSrc: e.frame.macSrc, macDst: e.frame.macDst,
    ipSrc: e.frame.ipSrc, ipDst: e.frame.ipDst, ttl: e.frame.ttl,
  }));
  assert.deepEqual(segments, [
    { device: 'PC-A', macSrc: 'AA:AA:AA:00:00:0A', macDst: '11:11:11:00:00:01', ipSrc: '192.168.1.10', ipDst: '192.168.2.20', ttl: 64 },
    { device: 'R1', macSrc: '11:11:11:00:00:02', macDst: '22:22:22:00:00:01', ipSrc: '192.168.1.10', ipDst: '192.168.2.20', ttl: 63 },
    { device: 'R2', macSrc: '22:22:22:00:00:02', macDst: 'BB:BB:BB:00:00:0B', ipSrc: '192.168.1.10', ipDst: '192.168.2.20', ttl: 62 },
  ]);
  const last = events.at(-1);
  assert.equal(last.type, 'deliver');
  assert.equal(last.device, 'PC-B');
  assert.equal(last.frame.ttl, 62);
});

test('mixte: IP addresses never change along the path', () => {
  const events = simulate(load('mixte'), 'PC-A', 'PC-B');
  for (const e of events) {
    if (e.frame?.kind !== 'data') continue;
    assert.equal(e.frame.ipSrc, '192.168.1.10', `event ${e.type} at ${e.device}`);
    assert.equal(e.frame.ipDst, '192.168.2.20', `event ${e.type} at ${e.device}`);
  }
});

test('mixte: PC-A ARPs for its gateway, each router ARPs for its next hop', () => {
  const events = simulate(load('mixte'), 'PC-A', 'PC-B');
  const requests = events.filter((e) => e.type === 'arp-request').map((e) => [e.device, e.frame.arp.targetIp, e.frame.macDst]);
  assert.deepEqual(requests, [
    ['PC-A', '192.168.1.1', BROADCAST],
    ['R1', '10.0.0.2', BROADCAST],
    ['R2', '192.168.2.20', BROADCAST],
  ]);
  // The ARP request comes before any data frame leaves PC-A.
  const firstArp = events.findIndex((e) => e.type === 'arp-request');
  const firstData = events.findIndex((e) => e.type === 'send');
  assert.ok(firstArp < firstData);
  // After the run, PC-A knows R1's MAC and nothing else.
  assert.deepEqual(events.at(-1).tables['PC-A'].arp, [{ ip: '192.168.1.1', mac: '11:11:11:00:00:01' }]);
});

test('mixte: switches never modify the frame', () => {
  const events = simulate(load('mixte'), 'PC-A', 'PC-B');
  for (const e of events.filter((x) => x.type === 'forward' || x.type === 'flood')) {
    // The frame the switch sends equals the frame that was last sent towards it.
    const before = events.slice(0, events.indexOf(e)).reverse()
      .find((x) => x.links.length && x.device !== e.device && x.frame.macSrc === e.frame.macSrc);
    assert.deepEqual(e.frame, before.frame, `${e.device} at t=${e.t}`);
  }
});

test('mixte: tables start empty, routing tables pre-filled, input not modified', () => {
  const topo = load('mixte');
  const copy = structuredClone(topo);
  const events = simulate(topo, 'PC-A', 'PC-B');
  assert.deepEqual(topo, copy, 'simulate() must not change its input');
  const first = events[0].tables;
  assert.deepEqual(first['PC-A'].arp, []);
  assert.deepEqual(first['SW1'].macTable, []);
  assert.deepEqual(first['R1'].arp, []);
  assert.equal(first['R1'].routes.length, 3);
});

test('same input gives exactly the same events', () => {
  const a = simulate(load('mixte'), 'PC-A', 'PC-B');
  const b = simulate(load('mixte'), 'PC-A', 'PC-B');
  assert.deepEqual(a, b);
});

test('events are in non-decreasing time order and each has a French note', () => {
  const events = simulate(load('mixte'), 'PC-A', 'PC-B');
  for (let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t);
  for (const e of events) assert.ok(typeof e.note === 'string' && e.note.length > 10);
});

test('TTL reaching 0 drops the packet', () => {
  const events = simulate(load('mixte'), 'PC-A', 'PC-B', { ttl: 2 });
  const last = events.at(-1);
  assert.equal(last.type, 'drop');
  assert.equal(last.device, 'R2');
  assert.ok(!events.some((e) => e.type === 'deliver'));
});

test('mixte PC-A -> PC-C (same LAN): ARP for the destination, no routing', () => {
  const events = simulate(load('mixte'), 'PC-A', 'PC-C');
  assert.equal(events.find((e) => e.type === 'arp-request').frame.arp.targetIp, '192.168.1.11');
  assert.ok(!events.some((e) => e.type === 'route'));
  assert.equal(events.at(-1).type, 'deliver');
  assert.equal(events.at(-1).device, 'PC-C');
});

test('longest-prefix match picks the most specific route', () => {
  const routes = [
    { reseau: '0.0.0.0', masque: 0, prochainSaut: '10.0.0.9', interface: 'e9' },
    { reseau: '192.168.0.0', masque: 16, prochainSaut: '10.0.0.1', interface: 'e1' },
    { reseau: '192.168.2.0', masque: 24, prochainSaut: '10.0.0.2', interface: 'e2' },
  ];
  assert.equal(longestPrefixMatch(routes, '192.168.2.20').interface, 'e2');
  assert.equal(longestPrefixMatch(routes, '192.168.7.1').interface, 'e1');
  assert.equal(longestPrefixMatch(routes, '8.8.8.8').interface, 'e9');
  assert.equal(longestPrefixMatch(routes.slice(1), '8.8.8.8'), null);
});

// ---------- étoile ----------

test('etoile PC-A -> PC-B: switching only, never a router', () => {
  const topo = load('etoile');
  const events = simulate(topo, 'PC-A', 'PC-B');
  const types = new Map(topo.devices.map((d) => [d.id, d.type]));
  assert.ok(events.every((e) => types.get(e.device) !== 'router'));
  assert.ok(!events.some((e) => e.type === 'route'));
  const sends = dataSends(events);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].frame.macSrc, 'AA:AA:AA:00:00:0A');
  assert.equal(sends[0].frame.macDst, 'BB:BB:BB:00:00:0B');
  assert.equal(sends[0].frame.ttl, 64);
  assert.equal(events.at(-1).type, 'deliver');
  assert.equal(events.at(-1).device, 'PC-B');
});

test('etoile: switch learns, floods the ARP broadcast, then forwards to one port', () => {
  const events = simulate(load('etoile'), 'PC-A', 'PC-B');
  const sw = events.filter((e) => e.device === 'SW1' && (e.type === 'flood' || e.type === 'forward'));
  assert.deepEqual(sw.map((e) => [e.type, e.links]), [
    ['flood', ['L2', 'L3', 'L4']], // ARP request, broadcast
    ['forward', ['L1']],           // ARP reply to PC-A (learned on p1)
    ['forward', ['L2']],           // data to PC-B (learned on p2)
  ]);
  assert.deepEqual(events.at(-1).tables['SW1'].macTable, [
    { mac: 'AA:AA:AA:00:00:0A', port: 'p1' },
    { mac: 'BB:BB:BB:00:00:0B', port: 'p2' },
  ]);
  // PC-C and PC-D see the broadcast and ignore it.
  const ignored = events.filter((e) => e.type === 'ignore').map((e) => e.device);
  assert.deepEqual(ignored, ['PC-C', 'PC-D']);
});

// ---------- bus ----------

test('bus PC-A -> PC-C: every station receives, only the destination keeps the frame', () => {
  const events = simulate(load('bus'), 'PC-A', 'PC-C');
  // Each frame put on the bus reaches the 3 other stations.
  const busFloods = events.filter((e) => e.device === 'BUS');
  assert.ok(busFloods.length >= 3); // ARP request, ARP reply, data
  for (const e of busFloods) assert.equal(e.links.length, 3);
  // The data frame: PC-B and PC-D see it and ignore it, PC-C keeps it.
  const dataSeen = events.filter((e) => e.frame?.kind === 'data' && ['ignore', 'deliver'].includes(e.type));
  assert.deepEqual(dataSeen.map((e) => [e.device, e.type]), [['PC-B', 'ignore'], ['PC-C', 'deliver'], ['PC-D', 'ignore']]);
  assert.ok(events.some((e) => e.type === 'deliver' && e.device === 'PC-C'));
});

// ---------- anneau ----------

test('anneau PC-A -> PC-C: frames go station to station in one direction', () => {
  const events = simulate(load('anneau'), 'PC-A', 'PC-C');
  // Data: A -> B (passes it on) -> C (keeps it).
  const data = events.filter((e) => e.frame?.kind === 'data' && e.type !== 'start');
  assert.deepEqual(data.map((e) => [e.device, e.type, e.links]), [
    ['PC-A', 'send', ['L1']],
    ['PC-B', 'forward', ['L2']],
    ['PC-C', 'deliver', []],
  ]);
  // The ARP reply from PC-C goes on in the same direction: C -> D -> A (not back through B).
  const reply = events.filter((e) => e.frame?.kind === 'arp' && e.frame.arp.op === 'reply');
  assert.deepEqual(reply.map((e) => e.device), ['PC-C', 'PC-D', 'PC-A']);
  // The ARP broadcast makes the full loop and is removed by its sender.
  assert.ok(events.some((e) => e.type === 'drop' && e.device === 'PC-A' && e.frame.macDst === BROADCAST));
});

// ---------- maillée ----------

test('maillee: the path follows the routing tables (R1-R2-R4 out, R4-R3-R1 back)', () => {
  const topo = load('maillee');
  const out = simulate(topo, 'PC-A', 'PC-B');
  assert.deepEqual(out.filter((e) => e.type === 'route').map((e) => e.device), ['R1', 'R2', 'R4']);
  assert.deepEqual(dataSends(out).map((e) => e.frame.ttl), [64, 63, 62, 61]);
  assert.equal(out.at(-1).type, 'deliver');
  assert.equal(out.at(-1).device, 'PC-B');
  // R1 has a default route via R3, but the /24 to 192.168.2.0 is more specific.
  const r1 = out.find((e) => e.type === 'route' && e.device === 'R1');
  assert.match(r1.note, /192\.168\.2\.0\/24 via 10\.0\.12\.2/);
  assert.deepEqual(r1.route, { reseau: '192.168.2.0', masque: 24, prochainSaut: '10.0.12.2', interface: 'e1' });

  const back = simulate(topo, 'PC-B', 'PC-A');
  assert.deepEqual(back.filter((e) => e.type === 'route').map((e) => e.device), ['R4', 'R3', 'R1']);
  assert.equal(back.at(-1).device, 'PC-A');
});

test('every PC pair of every topology is delivered', () => {
  for (const id of ['etoile', 'bus', 'anneau', 'maillee', 'mixte']) {
    const topo = load(id);
    const pcs = topo.devices.filter((d) => d.type === 'pc').map((d) => d.id);
    for (const s of pcs) for (const d of pcs) {
      if (s === d) continue;
      const events = simulate(topo, s, d);
      assert.ok(events.some((e) => e.type === 'deliver' && e.device === d), `${id}: ${s} -> ${d}`);
    }
  }
});
