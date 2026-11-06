// network.js — the rules of Module A (PC, ARP, switch, router). No DOM.
//
// simulate(topology, srcId, dstId) runs the whole journey of one packet and
// returns the ordered list of events. Each event is
//   { t, type, device, links, frame, note, tables }
// (see docs/formats.md). The UI only replays that list.

import { Scheduler } from './scheduler.js';
import { inSubnet, networkOf } from './ip.js';

export const BROADCAST = 'FF:FF:FF:FF:FF:FF';
export const INITIAL_TTL = 64;

/** "192.168.1.10" + 24 -> "192.168.1.0/24" (for the French notes). */
function cidr(ip, prefix) {
  const n = networkOf(ip, prefix);
  return `${[24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')}/${prefix}`;
}

/** Longest-prefix match: the matching route with the largest mask wins. */
export function longestPrefixMatch(routes, ip) {
  let best = null;
  for (const r of routes) {
    if (inSubnet(ip, r.reseau, r.masque) && (best === null || r.masque > best.masque)) best = r;
  }
  return best;
}

export class Simulator {
  constructor(topology, options = {}) {
    this.topo = structuredClone(topology); // never touch the caller's object
    this.ttl = options.ttl ?? INITIAL_TTL;
    this.sched = new Scheduler();
    this.events = [];
    this.devices = new Map(this.topo.devices.map((d) => [d.id, d]));
    this.pending = new Map(); // "R1|10.0.0.2" -> packets waiting for that ARP reply

    // For each interface end "dev:iface", the links attached to it.
    this.ends = new Map();
    for (const link of this.topo.links) {
      for (const [self, peer, dir] of [[link.a, link.b, 'out'], [link.b, link.a, 'in']]) {
        if (!this.ends.has(self)) this.ends.set(self, []);
        this.ends.get(self).push({ link, peer, dir });
      }
    }
  }

  // ---------- helpers ----------

  device(id) {
    const d = this.devices.get(id);
    if (!d) throw new Error(`Unknown device ${id}`);
    return d;
  }

  iface(dev, nom) {
    return dev.interfaces.find((i) => i.nom === nom);
  }

  /** Deep copy of every learned/static table, keyed by device id. */
  snapshot() {
    const out = {};
    for (const d of this.topo.devices) {
      const t = {};
      if (d.arp) t.arp = structuredClone(d.arp);
      if (d.macTable) t.macTable = structuredClone(d.macTable);
      if (d.routes) t.routes = structuredClone(d.routes);
      out[d.id] = t;
    }
    return out;
  }

  /** Record one event of the journal. */
  log(type, dev, links, frame, note) {
    this.events.push({
      t: this.sched.now,
      type,
      device: dev.id,
      links,
      frame: frame ? structuredClone(frame) : null,
      note,
      tables: this.snapshot(),
    });
  }

  /** The link a frame leaves on from dev:iface (in a ring, the outgoing one). */
  linkFrom(dev, ifaceName) {
    const list = this.ends.get(`${dev.id}:${ifaceName}`) ?? [];
    return list.find((e) => e.dir === 'out') ?? list[0] ?? null;
  }

  /** Put a frame on the link of dev:iface; it arrives at the other end after the link delay. */
  transmit(dev, ifaceName, frame) {
    const end = this.linkFrom(dev, ifaceName);
    if (!end) return null;
    const [peerId, peerIface] = end.peer.split(':');
    const copy = structuredClone(frame);
    this.sched.after(end.link.delai, () => this.arrive(this.device(peerId), peerIface, copy, end.link));
    return end.link.id;
  }

  /** A frame arrives on an interface: dispatch to the rule of that device type. */
  arrive(dev, ifaceName, frame, link) {
    if (dev.type === 'switch') this.switchReceive(dev, ifaceName, frame);
    else this.hostReceive(dev, this.iface(dev, ifaceName), frame);
  }

  // ---------- ARP (PCs and routers) ----------

  arpLookup(dev, ip) {
    return dev.arp.find((e) => e.ip === ip)?.mac ?? null;
  }

  arpLearn(dev, ip, mac) {
    const e = dev.arp.find((x) => x.ip === ip);
    if (e) e.mac = mac;
    else dev.arp.push({ ip, mac });
  }

  /**
   * Send an IP packet out of `iface` towards `nextHop`. If the MAC of the
   * next hop is unknown, hold the packet and broadcast an ARP request.
   */
  sendIp(dev, iface, packet, nextHop) {
    const mac = this.arpLookup(dev, nextHop);
    if (mac) {
      this.sendData(dev, iface, packet, mac, nextHop);
      return;
    }
    const key = `${dev.id}|${nextHop}`;
    const waiting = this.pending.get(key);
    if (waiting) {
      waiting.push({ iface, packet });
      return;
    }
    this.pending.set(key, [{ iface, packet }]);
    const frame = {
      kind: 'arp',
      macSrc: iface.mac,
      macDst: BROADCAST,
      arp: { op: 'request', senderIp: iface.ip, senderMac: iface.mac, targetIp: nextHop, targetMac: '00:00:00:00:00:00' },
    };
    const link = this.transmit(dev, iface.nom, frame);
    this.log('arp-request', dev, link ? [link] : [], frame,
      `${dev.id} ne connaît pas la MAC de ${nextHop} (absente de sa table ARP) : il garde le paquet ` +
      `et diffuse une requête ARP « Qui a ${nextHop} ? » vers ${BROADCAST}.`);
  }

  /** Build the Ethernet frame around the packet and send it. */
  sendData(dev, iface, packet, macDst, nextHop) {
    const frame = {
      kind: 'data',
      macSrc: iface.mac,
      macDst,
      ipSrc: packet.ipSrc,
      ipDst: packet.ipDst,
      ttl: packet.ttl,
    };
    const link = this.transmit(dev, iface.nom, frame);
    const note = dev.type === 'router'
      ? `${dev.id} réécrit les MAC : source ${iface.mac} (son interface ${iface.nom}), destination ${macDst} ` +
        `(${nextHop === packet.ipDst ? 'la machine destination' : `prochain saut ${nextHop}`}). ` +
        `Les IP ne changent pas : ${packet.ipSrc} → ${packet.ipDst}.`
      : `${dev.id} envoie la trame : MAC ${iface.mac} → ${macDst}, IP ${packet.ipSrc} → ${packet.ipDst}, TTL ${packet.ttl}.`;
    this.log('send', dev, link ? [link] : [], frame, note);
  }

  /** ARP frame received by a PC or a router interface. */
  arpReceive(dev, iface, frame) {
    const a = frame.arp;
    if (a.targetIp !== iface.ip) {
      this.log('ignore', dev, [], frame,
        `${dev.id} : la requête ARP cherche ${a.targetIp}, ce n'est pas son adresse (${iface.ip}) : il l'ignore.`);
      return;
    }
    this.arpLearn(dev, a.senderIp, a.senderMac);
    if (a.op === 'request') {
      const reply = {
        kind: 'arp',
        macSrc: iface.mac,
        macDst: a.senderMac,
        arp: { op: 'reply', senderIp: iface.ip, senderMac: iface.mac, targetIp: a.senderIp, targetMac: a.senderMac },
      };
      const link = this.transmit(dev, iface.nom, reply);
      this.log('arp-reply', dev, link ? [link] : [], reply,
        `${dev.id} : « ${iface.ip}, c'est moi ! » Il note ${a.senderIp} → ${a.senderMac} dans sa table ARP ` +
        `et répond directement à ${a.senderMac} avec sa MAC ${iface.mac}.`);
      return;
    }
    // ARP reply: the MAC is now known, release the packets that were waiting.
    this.log('arp-learn', dev, [], frame,
      `${dev.id} reçoit la réponse ARP : ${a.senderIp} a la MAC ${a.senderMac}. Il l'ajoute à sa table ARP.`);
    const key = `${dev.id}|${a.senderIp}`;
    const waiting = this.pending.get(key) ?? [];
    this.pending.delete(key);
    for (const { iface: out, packet } of waiting) this.sendData(dev, out, packet, a.senderMac, a.senderIp);
  }

  // ---------- PC and router ----------

  /** A frame arrives on the interface of a PC or a router. */
  hostReceive(dev, iface, frame) {
    if (frame.macDst !== iface.mac && frame.macDst !== BROADCAST) {
      this.log('ignore', dev, [], frame,
        `${dev.id} : la MAC destination ${frame.macDst} n'est pas la sienne (${iface.mac}) : il ignore la trame.`);
      return;
    }
    if (frame.kind === 'arp') {
      this.arpReceive(dev, iface, frame);
      return;
    }
    const own = dev.interfaces.some((i) => i.ip === frame.ipDst);
    if (own) {
      this.log('deliver', dev, [], frame,
        `${dev.id} reçoit le paquet de ${frame.ipSrc} : il est arrivé à destination (TTL ${frame.ttl}).`);
    } else if (dev.type === 'router') {
      this.route(dev, frame);
    } else {
      this.log('drop', dev, [], frame,
        `${dev.id} n'est pas ${frame.ipDst} et un PC ne route pas : le paquet est jeté.`);
    }
  }

  /** Router rule: TTL - 1, longest-prefix match, ARP for the next hop, rewrite both MACs. */
  route(dev, frame) {
    const ttl = frame.ttl - 1;
    if (ttl <= 0) {
      this.log('drop', dev, [], { ...frame, ttl: 0 },
        `${dev.id} : TTL ${frame.ttl} → 0, le paquet est détruit (cela évite qu'il tourne en boucle).`);
      return;
    }
    const r = longestPrefixMatch(dev.routes, frame.ipDst);
    if (!r) {
      this.log('drop', dev, [], frame, `${dev.id} : aucune route vers ${frame.ipDst}, le paquet est jeté.`);
      return;
    }
    const exit = this.iface(dev, r.interface);
    const nextHop = r.prochainSaut ?? frame.ipDst;
    const packet = { kind: 'data', macSrc: frame.macSrc, macDst: frame.macDst, ipSrc: frame.ipSrc, ipDst: frame.ipDst, ttl };
    this.log('route', dev, [], packet,
      `${dev.id} : TTL ${frame.ttl} → ${ttl} ; route ${r.reseau}/${r.masque} ` +
      `${r.prochainSaut ? `via ${r.prochainSaut}` : '(réseau directement connecté)'}, sortie par l'interface ${exit.nom}.`);
    this.sendIp(dev, exit, packet, nextHop);
  }

  // ---------- switch ----------

  /** Switch rule: learn source MAC + port, then forward to one port or flood. Never changes the frame. */
  switchReceive(dev, port, frame) {
    const known = dev.macTable.find((e) => e.mac === frame.macSrc);
    if (!known || known.port !== port) {
      if (known) known.port = port;
      else dev.macTable.push({ mac: frame.macSrc, port });
      this.log('mac-learn', dev, [], frame,
        `${dev.id} apprend que ${frame.macSrc} se trouve derrière son port ${port}.`);
    }

    const others = dev.interfaces.map((i) => i.nom).filter((p) => p !== port && this.linkFrom(dev, p));
    let out;
    let type;
    let note;
    const entry = frame.macDst === BROADCAST ? null : dev.macTable.find((e) => e.mac === frame.macDst);
    if (frame.macDst === BROADCAST) {
      out = others;
      type = 'flood';
      note = `${dev.id} : MAC destination ${BROADCAST} (diffusion) : il envoie une copie sur tous ses autres ports (${out.join(', ')}).`;
    } else if (!entry) {
      out = others;
      type = 'flood';
      note = `${dev.id} : ${frame.macDst} est absente de sa table MAC : il inonde tous ses autres ports (${out.join(', ')}).`;
    } else if (entry.port === port) {
      this.log('drop', dev, [], frame,
        `${dev.id} : ${frame.macDst} est derrière le port d'arrivée ${port} : il ne renvoie pas la trame (filtrage).`);
      return;
    } else {
      out = [entry.port];
      type = 'forward';
      note = `${dev.id} : ${frame.macDst} est derrière le port ${entry.port} : il transmet la trame sur ce seul port, sans la modifier.`;
    }
    const links = out.map((p) => this.transmit(dev, p, frame)).filter(Boolean);
    this.log(type, dev, links, frame, note);
  }

  // ---------- run ----------

  /** First event: the source PC decides who to ARP for (destination or gateway). */
  start(srcId, dstId) {
    const src = this.device(srcId);
    const dst = this.device(dstId);
    const s = src.interfaces[0];
    const d = dst.interfaces.find((i) => i.ip);
    if (!s?.ip || !d) throw new Error('Source and destination must have an IP address');

    const packet = { kind: 'data', macSrc: s.mac, macDst: null, ipSrc: s.ip, ipDst: d.ip, ttl: this.ttl };
    const local = inSubnet(d.ip, s.ip, s.masque);
    const nextHop = local ? d.ip : src.gateway;
    const net = cidr(s.ip, s.masque);
    if (!nextHop) {
      this.log('drop', src, [], packet,
        `${src.id} veut joindre ${d.ip}, qui n'est pas dans son réseau ${net}, mais il n'a pas de passerelle : envoi impossible.`);
      return;
    }
    this.log('start', src, [], packet, local
      ? `${src.id} veut envoyer un paquet à ${dst.id} (${d.ip}). ${d.ip} est dans son réseau ${net} : il cherche directement la MAC de ${d.ip}.`
      : `${src.id} veut envoyer un paquet à ${dst.id} (${d.ip}). ${d.ip} n'est pas dans son réseau ${net} : il passe par sa passerelle ${nextHop}.`);
    this.sendIp(src, s, packet, nextHop);
  }

  run(srcId, dstId) {
    this.sched.at(0, () => this.start(srcId, dstId));
    this.sched.run();
    return this.events;
  }
}

/** Run one packet from srcId to dstId; returns the ordered event list. */
export function simulate(topology, srcId, dstId, options = {}) {
  return new Simulator(topology, options).run(srcId, dstId);
}
