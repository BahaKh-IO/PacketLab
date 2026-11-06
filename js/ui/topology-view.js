// topology-view.js — draws a topology as SVG and highlights one event.
// It only reads the topology JSON and the event object; it never runs rules.

const NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes and optional text. */
function svgEl(tag, attrs = {}, text = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

export function createTopologyView(svg, topo, { onDeviceClick = () => {} } = {}) {
  svg.replaceChildren();
  const byId = new Map(topo.devices.map((d) => [d.id, d]));
  const pos = (id) => byId.get(id).position;
  const bus = topo.devices.find((d) => d.type === 'bus');
  const ring = topo.type === 'anneau';

  // viewBox from the device positions: the drawing scales to any width.
  const xs = topo.devices.map((d) => d.position.x);
  const ys = topo.devices.map((d) => d.position.y);
  const pad = 70;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  svg.setAttribute('viewBox', `${minX} ${minY} ${Math.max(...xs) - minX + pad} ${Math.max(...ys) - minY + pad}`);
  // On a phone the drawing keeps ~60 % of its natural width and scrolls sideways (see CSS --min-w).
  svg.style.setProperty('--min-w', `${Math.round((Math.max(...xs) - minX + pad) * 0.6)}px`);

  const defs = svgEl('defs');
  const marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' });
  marker.append(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head' }));
  defs.append(marker);
  const layerLinks = svgEl('g', { class: 'layer-links' });
  const layerLabels = svgEl('g', { class: 'layer-labels' });
  const layerDevices = svgEl('g', { class: 'layer-devices' });
  const layerPackets = svgEl('g', { class: 'layer-packets' });
  svg.append(defs, layerLinks, layerLabels, layerDevices, layerPackets);

  // ---------- links ----------
  const links = new Map(); // id -> { el, p1, p2 }
  if (bus) {
    const busXs = topo.devices.filter((d) => d !== bus).map((d) => d.position.x);
    const y = bus.position.y;
    layerLinks.append(svgEl('line', { x1: Math.min(...busXs) - 40, y1: y, x2: Math.max(...busXs) + 40, y2: y, class: 'bus-bar' }));
    layerLabels.append(svgEl('text', { x: Math.max(...busXs) + 40, y: y + 24, class: 'iface-label', 'text-anchor': 'end' }, 'câble partagé (bus)'));
  }
  for (const l of topo.links) {
    const [aId, aIf] = l.a.split(':');
    const [bId, bIf] = l.b.split(':');
    let p1 = pos(aId);
    let p2 = pos(bId);
    // A station is wired to the point of the bus right below/above it.
    if (bus && aId === bus.id) p1 = { x: p2.x, y: p1.y };
    if (bus && bId === bus.id) p2 = { x: p1.x, y: p2.y };
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const el = svgEl('polyline', { points: `${p1.x},${p1.y} ${mid.x},${mid.y} ${p2.x},${p2.y}`, class: 'link' });
    if (ring) el.setAttribute('marker-mid', 'url(#arrow)'); // direction of the ring
    layerLinks.append(el);
    links.set(l.id, { el, p1, p2, aId, bId });
    // Port names near each end, only for devices with several ports (switch, router).
    for (const [p, q, name, devId] of [[p1, p2, aIf, aId], [p2, p1, bIf, bId]]) {
      if (byId.get(devId).type === 'bus' || byId.get(devId).interfaces.length < 2) continue;
      const k = 0.4;
      layerLabels.append(svgEl('text', {
        x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k - 6, class: 'iface-label', 'text-anchor': 'middle',
      }, name));
    }
  }

  // ---------- devices ----------
  const nodes = new Map();
  for (const d of topo.devices) {
    if (d.type === 'bus') continue;
    const g = svgEl('g', { class: `device device-${d.type}`, transform: `translate(${d.position.x} ${d.position.y})` });
    if (d.type === 'router') g.append(svgEl('circle', { r: 27, class: 'shape' }));
    else if (d.type === 'switch') g.append(svgEl('rect', { x: -38, y: -18, width: 76, height: 36, rx: 5, class: 'shape' }));
    else g.append(svgEl('rect', { x: -30, y: -20, width: 60, height: 40, rx: 7, class: 'shape' }));
    g.append(svgEl('text', { y: 5, 'text-anchor': 'middle', class: 'device-label' }, d.id));
    if (d.type === 'pc') {
      g.append(svgEl('text', { y: 36, 'text-anchor': 'middle', class: 'device-ip' }, d.interfaces[0].ip));
    }
    const title = svgEl('title', {}, d.type === 'router'
      ? `${d.id} : ${d.interfaces.map((i) => `${i.nom} ${i.ip}/${i.masque}`).join(', ')}`
      : d.interfaces[0].ip ? `${d.id} : ${d.interfaces[0].ip}/${d.interfaces[0].masque}, MAC ${d.interfaces[0].mac}` : d.id);
    g.append(title);
    // Click (or Tab + Entrée) on a device: show its tables.
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Voir les tables de ${d.id}`);
    g.addEventListener('click', () => onDeviceClick(d.id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation(); // space here selects, it does not play/pause
        onDeviceClick(d.id);
      }
    });
    layerDevices.append(g);
    nodes.set(d.id, g);
  }

  /** Mark the device whose tables are shown in the side panel. */
  function select(id) {
    for (const [nid, g] of nodes) g.classList.toggle('selected', nid === id);
  }

  // ---------- highlight one event ----------
  let frameRequest = null; // current requestAnimationFrame id

  function clear() {
    cancelAnimationFrame(frameRequest);
    for (const g of nodes.values()) g.classList.remove('active');
    for (const { el } of links.values()) el.classList.remove('active');
    layerPackets.replaceChildren();
  }

  /**
   * Move every dot from its start point to its end point in `duration` ms.
   * Each dot is { el, from, to }. With duration 0 the dots are put at the end directly.
   */
  function animate(dots, duration) {
    const place = (k) => {
      const e = k * k * (3 - 2 * k); // smooth start and stop
      for (const d of dots) {
        d.el.setAttribute('cx', d.from.x + (d.to.x - d.from.x) * e);
        d.el.setAttribute('cy', d.from.y + (d.to.y - d.from.y) * e);
      }
    };
    if (duration <= 0) {
      place(1);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      place(k);
      if (k < 1) frameRequest = requestAnimationFrame(tick);
    };
    place(0);
    frameRequest = requestAnimationFrame(tick);
  }

  /** Show one event; the frame travels along its link(s) during `duration` ms. */
  function show(event, { duration = 0 } = {}) {
    clear();
    if (!event) return;
    nodes.get(event.device)?.classList.add('active');
    const kind = event.frame?.kind ?? 'data';
    const dots = [];
    for (const id of event.links) {
      const l = links.get(id);
      if (!l) continue;
      l.el.classList.add('active');
      // The frame leaves from the end of the link at the acting device.
      const [from, to] = l.bId === event.device ? [l.p2, l.p1] : [l.p1, l.p2];
      const end = { x: from.x + (to.x - from.x) * 0.8, y: from.y + (to.y - from.y) * 0.8 }; // stop before the icon
      const el = svgEl('circle', { r: 9, class: `packet packet-${kind}` });
      layerPackets.append(el);
      dots.push({ el, from, to: end });
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    animate(dots, reduced ? 0 : duration);
    const p = byId.get(event.device)?.position;
    if (p && event.links.length === 0 && event.frame) {
      if (event.type === 'drop' || event.type === 'ignore') {
        const s = 8;
        const cls = event.type === 'drop' ? 'cross cross-drop' : 'cross cross-ignore';
        layerPackets.append(svgEl('path', { d: `M${p.x - s + 38},${p.y - s - 26} l${2 * s},${2 * s} M${p.x + s + 38},${p.y - s - 26} l${-2 * s},${2 * s}`, class: cls }));
      } else {
        layerPackets.append(svgEl('circle', { cx: p.x + 38, cy: p.y - 26, r: 9, class: `packet packet-${kind}` }));
      }
    }
  }

  return { show, clear, select };
}
