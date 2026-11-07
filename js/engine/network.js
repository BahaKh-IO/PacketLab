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
  log(type, dev, links, frame, note, extra = {}) {
    this.events.push({
      t: this.sched.now,
      type,
      device: dev.id,
      links,
      frame: frame ? structuredClone(frame) : null,
      note,
      tables: this.snapshot(),
      ...structuredClone(extra), // e.g. { route } on route events
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
    if (end.link.coupe) {
      // Breakdown scenario: unplugged cable, the frame never reaches the other end.
      this.sched.after(end.link.delai, () => this.log('drop', this.device(peerId), [], copy,
        `Le câble ${end.link.id} est débranché : la trame envoyée par ${dev.id} n'arrive jamais à ${peerId}.`));
      return end.link.id;
    }
    this.sched.after(end.link.delai, () => this.arrive(this.device(peerId), peerIface, copy, end.link));
    return end.link.id;
  }

  /** A frame arrives on an interface: dispatch to the rule of that device type. */
  arrive(dev, ifaceName, frame) {
    if (dev.type === 'switch') this.switchReceive(dev, ifaceName, frame);
    else if (dev.type === 'bus') this.busReceive(dev, ifaceName, frame);
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
  sendIp(dev, iface, packet, nextHop, reason = '') {
    const mac = this.arpLookup(dev, nextHop);
    if (mac) {
      this.sendData(dev, iface, packet, mac, nextHop, true, reason);
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
      `${reason}${dev.id} ne connaît pas la MAC de ${nextHop} (absente de sa table ARP) : il garde le paquet ` +
      `et diffuse une requête ARP « Qui a ${nextHop} ? » vers ${BROADCAST}.`);
  }

  /** Build the Ethernet frame around the packet and send it. */
  sendData(dev, iface, packet, macDst, nextHop, fromTable = false, reason = '') {
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
    const cached = fromTable ? ` (MAC de ${nextHop} déjà dans sa table ARP : pas besoin de requête ARP.)` : '';
    this.log('send', dev, link ? [link] : [], frame, reason + note + cached);
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
    if (this.topo.type === 'anneau' && this.ringPass(dev, iface, frame)) return;
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
      `${r.prochainSaut ? `via ${r.prochainSaut}` : '(réseau directement connecté)'}, sortie par l'interface ${exit.nom}.`,
      { route: r });
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

  // ---------- bus and ring ----------

  /** Bus rule: the shared cable carries the frame to every other station; each one checks the MAC itself. */
  busReceive(dev, port, frame) {
    const others = dev.interfaces.map((i) => i.nom).filter((p) => p !== port && this.linkFrom(dev, p));
    const links = others.map((p) => this.transmit(dev, p, frame)).filter(Boolean);
    this.log('flood', dev, links, frame,
      `Le bus est un support partagé : la trame (MAC destination ${frame.macDst}) parvient à toutes les autres stations ; ` +
      `seule celle dont c'est la MAC la gardera.`);
  }

  /**
   * Ring rule: a station passes on every frame that is not for it, in one
   * direction (link a -> b). A broadcast goes all the way round and is removed
   * by its sender. Returns true when the frame needs no further processing.
   */
  ringPass(dev, iface, frame) {
    if (frame.macSrc === iface.mac) {
      this.log('drop', dev, [], frame,
        `La trame a fait le tour de l'anneau et revient à ${dev.id}, son émetteur, qui la retire de l'anneau.`);
      return true;
    }
    if (frame.macDst === iface.mac) return false; // for me: normal processing, the frame stops here
    const link = this.transmit(dev, iface.nom, frame);
    const isArpTarget = frame.kind === 'arp' && frame.arp.op === 'request' && frame.arp.targetIp === iface.ip;
    if (isArpTarget) {
      this.log('forward', dev, link ? [link] : [], frame,
        `${dev.id} reconnaît sa propre IP dans la requête ARP ; la diffusion continue quand même vers la station suivante, jusqu'à revenir à l'émetteur.`);
      return false; // then answer the request (arpReceive)
    }
    this.log('forward', dev, link ? [link] : [], frame, frame.macDst === BROADCAST
      ? `${dev.id} : la requête ARP cherche ${frame.arp?.targetIp}, ce n'est pas lui : il la passe à la station suivante.`
      : `${dev.id} : la trame est pour ${frame.macDst}, pas pour lui (${iface.mac}) : il la passe à la station suivante.`);
    return true;
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
    // Step 1 only states the question; the decision is told with the next step,
    // so that « Prédire d'abord » can ask it without giving the answer away.
    this.log('start', src, [], packet,
      `${src.id} veut envoyer un paquet à ${dst.id} (${d.ip}). Il compare cette adresse avec son propre réseau, ${net}.`);
    const reason = local
      ? `${d.ip} est dans son réseau ${net} : ${src.id} cherche directement la MAC de ${d.ip}. `
      : `${d.ip} n'est pas dans son réseau ${net} : ${src.id} passe par sa passerelle ${nextHop}. `;
    this.sendIp(src, s, packet, nextHop, reason);
  }

  /** Packets still waiting for an ARP reply when nothing moves any more: nobody answered. */
  dropUnanswered() {
    for (const [key, waiting] of this.pending) {
      const [devId, ip] = key.split('|');
      for (const { packet } of waiting) {
        this.log('drop', this.device(devId), [], packet,
          `Personne n'a répondu à la requête ARP de ${devId} pour ${ip} : le paquet en attente n'est jamais envoyé.`);
      }
    }
    this.pending.clear();
  }

  run(srcId, dstId) {
    return this.runAll([{ source: srcId, destination: dstId }]);
  }

  /**
   * Several packets, one after the other: each send starts when the network is
   * quiet again. Tables are kept between sends (the 2nd packet finds them filled).
   */
  runAll(envois) {
    envois.forEach(({ source, destination }, k) => {
      this.sched.at(k === 0 ? 0 : this.sched.now + GAP_BETWEEN_SENDS, () => this.start(source, destination));
      this.sched.run();
      this.dropUnanswered();
    });
    return this.events;
  }
}

const GAP_BETWEEN_SENDS = 50; // ms of silence between two sends of a scenario

/** Run one packet from srcId to dstId; returns the ordered event list. */
export function simulate(topology, srcId, dstId, options = {}) {
  return new Simulator(topology, options).run(srcId, dstId);
}

/**
 * Copy of the topology with the breakdowns of a scenario applied (docs/formats.md, Panne).
 * The original object is never changed.
 */
export function appliquerPannes(topology, pannes = []) {
  const topo = structuredClone(topology);
  const device = (id) => {
    const d = topo.devices.find((x) => x.id === id);
    if (!d) throw new Error(`Panne: unknown device ${id}`);
    return d;
  };
  for (const p of pannes) {
    if (p.type === 'passerelle') {
      device(p.equipement).gateway = p.valeur;
    } else if (p.type === 'masque') {
      const d = device(p.equipement);
      const i = p.interface ? d.interfaces.find((x) => x.nom === p.interface) : d.interfaces[0];
      i.masque = p.valeur;
    } else if (p.type === 'route' || p.type === 'route-supprimee') {
      const d = device(p.equipement);
      const k = d.routes.findIndex((r) => r.reseau === p.reseau && r.masque === p.masque);
      if (p.type === 'route-supprimee') {
        if (k < 0) throw new Error(`Panne: no route ${p.reseau}/${p.masque} on ${p.equipement}`);
        d.routes.splice(k, 1);
      } else {
        const r = { reseau: p.reseau, masque: p.masque, prochainSaut: p.prochainSaut ?? null, interface: p.interface };
        if (k < 0) d.routes.push(r);
        else d.routes[k] = r;
      }
    } else if (p.type === 'cable-debranche') {
      const l = topo.links.find((x) => x.id === p.lien);
      if (!l) throw new Error(`Panne: unknown link ${p.lien}`);
      l.coupe = true;
    } else {
      throw new Error(`Panne: unknown type ${p.type}`);
    }
  }
  return topo;
}

/** Run a scenario of a topology (several sends, breakdowns, optional TTL). */
export function simulateScenario(topology, scenario) {
  const topo = appliquerPannes(topology, scenario.pannes ?? []);
  const options = scenario.ttl ? { ttl: scenario.ttl } : {};
  return new Simulator(topo, options).runAll(scenario.envois);
}
