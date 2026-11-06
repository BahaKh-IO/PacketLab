// Checks every topology file against the rules of docs/formats.md:
// empty learned tables, no duplicate MAC, valid links, every IP in its
// segment's subnet, gateways and next hops directly connected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inSubnet, networkOf } from '../js/engine/ip.js';

const dir = new URL('../data/topologies/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const topo = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));

  test(`${file}: structure and addressing`, () => {
    assert.equal(topo.id + '.json', file, 'id matches file name');
    const byId = new Map(topo.devices.map((d) => [d.id, d]));
    assert.equal(byId.size, topo.devices.length, 'device ids are unique');

    // Learned tables start empty.
    for (const d of topo.devices) {
      if (d.type === 'pc' || d.type === 'router') assert.deepEqual(d.arp, [], `${d.id} ARP empty`);
      if (d.type === 'switch') assert.deepEqual(d.macTable, [], `${d.id} MAC table empty`);
    }

    // No duplicate MAC.
    const macs = topo.devices.flatMap((d) => d.interfaces.filter((i) => i.mac).map((i) => i.mac));
    assert.equal(new Set(macs).size, macs.length, 'no duplicate MAC');

    // Links reference real interfaces. Union-find groups interfaces into
    // layer-2 segments: a link joins its ends, a switch or bus joins its ports.
    const parent = new Map();
    const find = (k) => (parent.get(k) === k ? k : find(parent.get(k)));
    const union = (a, b) => parent.set(find(a), find(b));
    for (const d of topo.devices) for (const i of d.interfaces) parent.set(`${d.id}:${i.nom}`, `${d.id}:${i.nom}`);
    const uses = new Map();
    for (const l of topo.links) {
      for (const end of [l.a, l.b]) {
        assert.ok(parent.has(end), `${l.id}: ${end} exists`);
        uses.set(end, (uses.get(end) ?? 0) + 1);
      }
      union(l.a, l.b);
      assert.ok(l.delai > 0, `${l.id} has a delay`);
    }
    const maxUses = topo.type === 'anneau' ? 2 : 1;
    for (const [end, n] of uses) assert.ok(n <= maxUses, `${end} used by ${n} links`);
    for (const d of topo.devices) {
      if (d.type === 'switch' || d.type === 'bus') {
        for (const i of d.interfaces) union(`${d.id}:${d.interfaces[0].nom}`, `${d.id}:${i.nom}`);
      }
    }

    // Every IP interface of a segment is in the same subnet.
    const ipIfaces = topo.devices.flatMap((d) =>
      d.interfaces.filter((i) => i.ip).map((i) => ({ dev: d, iface: i, seg: find(`${d.id}:${i.nom}`) })));
    const segNet = new Map();
    for (const { dev, iface, seg } of ipIfaces) {
      const net = `${networkOf(iface.ip, iface.masque)}/${iface.masque}`;
      if (!segNet.has(seg)) segNet.set(seg, net);
      assert.equal(net, segNet.get(seg), `${dev.id}:${iface.nom} ${iface.ip}/${iface.masque} in its segment's subnet`);
    }
    const routerIpsOnSeg = (seg) => ipIfaces.filter((x) => x.dev.type === 'router' && x.seg === seg).map((x) => x.iface.ip);

    for (const d of topo.devices) {
      // PC gateway: in its subnet and owned by a router on the same segment.
      if (d.type === 'pc' && d.gateway !== null) {
        const i = d.interfaces[0];
        assert.ok(inSubnet(d.gateway, i.ip, i.masque), `${d.id} gateway in its subnet`);
        assert.ok(routerIpsOnSeg(find(`${d.id}:${i.nom}`)).includes(d.gateway), `${d.id} gateway is a router on its LAN`);
      }
      // Router routes: exit interface exists, next hop directly connected.
      if (d.type === 'router') {
        for (const r of d.routes) {
          const exit = d.interfaces.find((i) => i.nom === r.interface);
          assert.ok(exit, `${d.id} route ${r.reseau}/${r.masque}: interface ${r.interface} exists`);
          if (r.prochainSaut === null) {
            assert.ok(inSubnet(exit.ip, r.reseau, r.masque) && r.masque === exit.masque,
              `${d.id} connected route ${r.reseau}/${r.masque} matches ${r.interface}`);
          } else {
            assert.ok(inSubnet(r.prochainSaut, exit.ip, exit.masque), `${d.id} next hop ${r.prochainSaut} directly connected`);
            assert.ok(routerIpsOnSeg(find(`${d.id}:${exit.nom}`)).includes(r.prochainSaut),
              `${d.id} next hop ${r.prochainSaut} is a router on that link`);
          }
        }
      }
    }
  });
}
