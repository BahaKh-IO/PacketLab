// predict.js — « Prédire d'abord » mode: questions generated from the event list.
// No DOM: it only reads the events (and the topology for names and addresses),
// so it can be tested with node. The right answer is always read from the
// event that the question is about: the engine is the referee.
//
// predictions(events, topo) -> [{ kind, device, apresEtape, enonce, choix, bonne, explication }]
// apresEtape (1-based) = the step after which the player pauses and asks;
// the answer is shown by the very next step.

const BROADCAST = 'FF:FF:FF:FF:FF:FF';

/** Same order every time, but the right answer is not always in the same place. */
function arrange(right, others, seed) {
  const list = [right, ...others.filter((x) => x !== right && x !== undefined && x !== null)];
  const unique = [...new Set(list)].slice(0, 4);
  const shift = seed % unique.length;
  const choix = [...unique.slice(shift), ...unique.slice(0, shift)];
  return { choix, bonne: choix.indexOf(right) };
}

/** Last event before index k matching pred. */
function before(events, k, pred) {
  for (let i = k - 1; i >= 0; i--) if (pred(events[i])) return events[i];
  return null;
}

export function predictions(events, topo) {
  const devices = new Map(topo.devices.map((d) => [d.id, d]));
  const macOfIp = (ip) => topo.devices.flatMap((d) => d.interfaces).find((i) => i.ip === ip)?.mac;
  const sharedMedium = topo.type === 'bus' || topo.type === 'anneau';
  const seen = new Set(); // "kind|device": once per kind of step per device
  const out = [];

  events.forEach((e, k) => {
    if (k === 0) return; // nothing shown yet before the first step
    const dev = devices.get(e.device);
    if (!dev) return;
    const add = (kind, q) => {
      const key = `${kind}|${dev.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind, device: dev.id, apresEtape: k, ...q });
    };

    // 1. Which IP will the PC ask for in its ARP request? (Routers: see 3, the next hop.)
    if (e.type === 'arp-request' && dev.type === 'pc') {
      const target = e.frame.arp.targetIp;
      const packet = before(events, k + 1, (x) => x.device === dev.id && x.frame?.kind === 'data');
      const finalIp = packet?.frame.ipDst;
      const own = dev.interfaces.find((i) => i.mac === e.frame.macSrc)?.ip;
      const { choix, bonne } = arrange(target, [finalIp, dev.gateway, own, '255.255.255.255'], k);
      add('arp-cible', {
        enonce: `${dev.id} doit trouver une adresse MAC avant d'envoyer le paquet. Pour quelle IP va-t-il faire une requête ARP ?`,
        choix, bonne,
        explication: target === finalIp
          ? `${target} est dans le même réseau que ${dev.id} : il cherche directement la MAC de la destination.`
          : `La destination ${finalIp} n'est pas joignable directement : ${dev.id} cherche la MAC du prochain équipement, ${target}. ARP ne sert que sur le réseau local.`,
      });
    }

    // 2. What will the switch do with this frame?
    if (dev.type === 'switch' && ['forward', 'flood', 'drop'].includes(e.type)) {
      const choix = ["L'envoyer sur un seul port", "L'envoyer sur tous ses autres ports", 'La jeter', 'Changer ses adresses MAC puis la transmettre'];
      const bonne = { forward: 0, flood: 1, drop: 2 }[e.type];
      const why = {
        forward: `${e.frame.macDst} est déjà dans la table MAC de ${dev.id} : il sait derrière quel port elle se trouve.`,
        flood: e.frame.macDst === BROADCAST
          ? `La MAC destination est ${BROADCAST} (diffusion) : un switch envoie une diffusion sur tous ses ports, sauf celui d'arrivée.`
          : `${e.frame.macDst} n'est pas encore dans la table MAC de ${dev.id} : il inonde tous ses autres ports.`,
        drop: `${e.frame.macDst} est derrière le port d'arrivée : renvoyer la trame ne servirait à rien.`,
      }[e.type];
      add('switch', {
        enonce: `Une trame pour ${e.frame.macDst} arrive à ${dev.id}. Que va-t-il en faire ?`,
        choix, bonne,
        explication: `${why} Dans tous les cas, un switch ne modifie jamais les adresses.`,
      });
    }

    // 3. Next hop chosen by the router (asked before it routes, with the TTL question).
    if (e.type === 'route' && e.route) {
      const nextHop = e.route.prochainSaut ?? e.frame.ipDst;
      const own = dev.interfaces.map((i) => i.ip);
      const otherHops = dev.routes.map((r) => r.prochainSaut).filter(Boolean);
      const { choix, bonne } = arrange(nextHop, [e.frame.ipDst, ...otherHops, e.frame.ipSrc, ...own], k);
      add('prochain-saut', {
        enonce: `Le paquet pour ${e.frame.ipDst} arrive à ${dev.id}. Vers quelle adresse (prochain saut) ${dev.id} va-t-il l'envoyer ?`,
        choix, bonne,
        explication: `${dev.id} cherche dans sa table de routage la route la plus précise qui contient ${e.frame.ipDst} : ` +
          `${e.route.reseau}/${e.route.masque}${e.route.prochainSaut ? `, via ${e.route.prochainSaut}` : ', réseau directement connecté : le prochain saut est la destination elle-même'}.`,
      });
    }

    // 4. TTL after the router.
    if (e.type === 'route') {
      const after = e.frame.ttl;
      const was = after + 1;
      const { choix, bonne } = arrange(String(after), [String(was), String(was + 1), String(after - 1)], k);
      add('ttl', {
        enonce: `Le paquet arrive à ${dev.id} avec un TTL de ${was}. Quel sera son TTL quand ${dev.id} le renverra ?`,
        choix, bonne,
        explication: `Chaque routeur enlève 1 au TTL : ${was} → ${after}. Un switch, lui, ne touche pas au TTL.`,
      });
    }

    // 5. MAC destination after the router — only when it comes from the ARP table
    // (otherwise the ARP reply has just shown it).
    if (dev.type === 'router' && e.type === 'send' && events[k - 1].type === 'route' && events[k - 1].device === dev.id) {
      const route = before(events, k, (x) => x.type === 'route' && x.device === dev.id)?.route;
      const nextHop = route?.prochainSaut ?? e.frame.ipDst;
      const incoming = before(events, k, (x) => x.frame?.kind === 'data' && x.device !== dev.id && x.links.length);
      const { choix, bonne } = arrange(e.frame.macDst,
        [incoming?.frame.macDst, macOfIp(e.frame.ipDst), BROADCAST, e.frame.macSrc], k);
      add('mac-routeur', {
        enonce: `${dev.id} va renvoyer la trame. Quelle sera sa MAC destination ?`,
        choix, bonne,
        explication: `La MAC destination devient celle du prochain saut (${nextHop === e.frame.ipDst ? `la destination ${nextHop} elle-même` : nextHop}), trouvée dans la table ARP de ${dev.id}. ` +
          'Les MAC ne servent que sur un tronçon ; les IP, elles, ne changent pas.',
      });
    }

    // 6. Bus and ring: does this station keep the frame?
    if (sharedMedium && dev.type === 'pc' && e.frame?.kind === 'data' && ['deliver', 'ignore', 'forward'].includes(e.type)) {
      const choix = ['Elle la garde', "Elle l'ignore", 'Elle la passe à la station suivante'];
      const bonne = { deliver: 0, ignore: 1, forward: 2 }[e.type];
      const mine = dev.interfaces[0].mac;
      add('station', {
        enonce: `Une trame pour ${e.frame.macDst} arrive à ${dev.id} (MAC ${mine}). Que fait cette station ?`,
        choix: topo.type === 'bus' ? choix.slice(0, 2) : choix,
        bonne,
        explication: e.type === 'deliver'
          ? `La MAC destination est celle de ${dev.id} : la trame est pour elle.`
          : topo.type === 'bus'
            ? `Sur un bus, toutes les stations reçoivent la trame ; ${dev.id} voit que la MAC destination n'est pas la sienne et l'ignore.`
            : `Dans un anneau, une station qui n'est pas la destinataire passe la trame à la suivante, toujours dans le même sens.`,
      });
    }
  });
  return out;
}
