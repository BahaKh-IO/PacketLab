// panels.js — side panels: frame headers, table of the active device, event log.
// Everything is read from the event list; changed values are highlighted.

const BROADCAST = 'FF:FF:FF:FF:FF:FF';

/** Create an HTML element with a class and children (strings or nodes). */
function h(tag, cls, ...children) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...children.filter((c) => c !== null && c !== undefined));
  return el;
}

const macText = (mac) => (mac === null ? '? (pas encore connue)' : mac === BROADCAST ? `${mac} (diffusion)` : mac);

/** Last frame of the same kind before step i (to see what changed). */
function previousFrame(events, i, kind) {
  for (let k = i - 1; k >= 0; k--) if (events[k].frame?.kind === kind) return events[k].frame;
  return null;
}

function fieldList(rows, prev) {
  const dl = h('dl', 'fields');
  for (const [label, key, value] of rows) {
    const changed = prev && prev[key] !== undefined && JSON.stringify(prev[key]) !== JSON.stringify(value.raw);
    dl.append(h('dt', null, label), h('dd', changed ? 'changed' : null, value.text));
  }
  return dl;
}

/** Ethernet + IP (or ARP) headers of the frame of step i. */
export function renderHeaders(el, events, i) {
  const f = events[i].frame;
  if (!f) {
    el.replaceChildren(h('p', 'muted', 'Pas de trame à cette étape.'));
    return;
  }
  const prev = previousFrame(events, i, f.kind);
  const v = (raw, text = raw) => ({ raw, text: String(text) });
  const eth = h('div', 'hdr-group', h('h3', null, 'Trame Ethernet (couche 2)'), fieldList([
    ['MAC source', 'macSrc', v(f.macSrc, macText(f.macSrc))],
    ['MAC destination', 'macDst', v(f.macDst, macText(f.macDst))],
  ], prev));
  let body;
  if (f.kind === 'arp') {
    const a = f.arp;
    const pa = prev?.arp;
    body = h('div', 'hdr-group arp', h('h3', null, `Message ARP : ${a.op === 'request' ? 'requête' : 'réponse'}`), fieldList([
      ['IP émetteur', 'senderIp', v(a.senderIp)],
      ['MAC émetteur', 'senderMac', v(a.senderMac)],
      ['IP cherchée', 'targetIp', v(a.targetIp)],
      ['MAC cible', 'targetMac', v(a.targetMac, a.targetMac === '00:00:00:00:00:00' ? '00:00:00:00:00:00 (inconnue)' : a.targetMac)],
    ], pa));
  } else {
    body = h('div', 'hdr-group', h('h3', null, 'Paquet IP (couche 3)'), fieldList([
      ['IP source', 'ipSrc', v(f.ipSrc)],
      ['IP destination', 'ipDst', v(f.ipDst)],
      ['TTL', 'ttl', v(f.ttl)],
    ], prev));
  }
  el.replaceChildren(eth, body);
}

function table(caption, head, rows, prevRows) {
  const prevKeys = new Set((prevRows ?? []).map((r) => JSON.stringify(r)));
  const t = h('table', 'data-table', h('caption', null, caption));
  t.append(h('thead', null, h('tr', null, ...head.map((x) => h('th', null, x)))));
  const tb = h('tbody');
  if (rows.length === 0) tb.append(h('tr', null, Object.assign(h('td', 'muted', '(vide)'), { colSpan: head.length })));
  for (const r of rows) {
    const isNew = prevRows && !prevKeys.has(JSON.stringify(r.raw));
    tb.append(h('tr', r.chosen ? 'chosen' : isNew ? 'new' : null, ...r.cells.map((c) => h('td', null, c))));
  }
  t.append(tb);
  return t;
}

/** Tables of the device acting at step i (ARP, MAC, routing). */
export function renderTables(el, events, i, topo) {
  const e = events[i];
  const dev = topo.devices.find((d) => d.id === e.device);
  const now = e.tables[e.device] ?? {};
  const before = i > 0 ? events[i - 1].tables[e.device] ?? {} : {};
  const parts = [];
  if (dev.type === 'bus') {
    parts.push(h('p', 'muted', "Le bus n'a pas de table : c'est un simple câble partagé, il ne lit aucune adresse."));
  }
  if (now.macTable) {
    parts.push(table(`Table MAC de ${dev.id}`, ['MAC', 'Port'],
      now.macTable.map((r) => ({ raw: r, cells: [r.mac, r.port] })), before.macTable));
  }
  if (now.arp) {
    parts.push(table(`Table ARP de ${dev.id}`, ['IP', 'MAC'],
      now.arp.map((r) => ({ raw: r, cells: [r.ip, r.mac] })), before.arp));
  }
  if (now.routes) {
    parts.push(table(`Table de routage de ${dev.id}`, ['Réseau', 'Prochain saut', 'Interface'],
      now.routes.map((r) => ({
        raw: r,
        chosen: e.route && JSON.stringify(e.route) === JSON.stringify(r), // route picked at this step
        cells: [`${r.reseau}/${r.masque}`, r.prochainSaut ?? 'direct', r.interface],
      })), null));
  }
  el.replaceChildren(...parts);
}

/** The log: one line per step, lines after the current step stay hidden. */
export function createLog(ol) {
  let items = [];
  return {
    load(events) {
      items = events.map((e, k) => h('li', null,
        h('span', 'log-step', `${k + 1}.`), ' ',
        h('span', 'log-time', `t=${e.t} ms`), ' ', e.note));
      ol.replaceChildren(...items);
    },
    show(i) {
      items.forEach((li, k) => {
        li.hidden = k > i;
        li.classList.toggle('current', k === i);
      });
      // Scroll inside the log only (scrollIntoView would also move the whole page).
      const li = items[i];
      if (li && (li.offsetTop < ol.scrollTop || li.offsetTop + li.offsetHeight > ol.scrollTop + ol.clientHeight)) {
        ol.scrollTop = li.offsetTop - ol.clientHeight + li.offsetHeight + 8;
      }
    },
  };
}
