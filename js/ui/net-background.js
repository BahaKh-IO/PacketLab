// net-background.js — a living network drawn behind the pages: devices drift, link up when
// they come close, and packets hop from device to device trailing their bits.
// Interactive: devices near the pointer link to it; a click on an empty area sends a burst
// of packets from the nearest device. Decorative only (aria-hidden, no pointer events).
// With prefers-reduced-motion it draws one still frame.

const TONES = {
  light: {
    link: [37, 99, 235, 0.09], device: [37, 99, 235, 0.22], deviceFill: [255, 255, 255, 0.9],
    pointer: [6, 182, 212, 0.22], packets: ['#06b6d4', '#7c3aed', '#2563eb'], bits: [37, 99, 235, 0.38],
    packetAlpha: 0.55, density: 1 / 26000, maxNodes: 46,
  },
  dark: {
    link: [103, 232, 249, 0.13], device: [165, 180, 252, 0.42], deviceFill: [11, 29, 58, 0.9],
    pointer: [34, 211, 238, 0.4], packets: ['#22d3ee', '#a78bfa', '#60a5fa'], bits: [165, 243, 252, 0.55],
    packetAlpha: 0.95, density: 1 / 14000, maxNodes: 60,
  },
};
const LINK_DIST = 150;
const POINTER_DIST = 170;
const rgba = ([r, g, b, a], k = 1) => `rgba(${r},${g},${b},${a * k})`;
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role=button], [role=tab], .topology, .strip, .flashcard';

export function startNetworkBackground(canvas, { tone = 'light', area = canvas.parentElement } = {}) {
  const T = TONES[tone];
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let w = 0;
  let h = 0;
  let nodes = [];
  let packets = [];
  let pointer = null;
  let frame = null;
  let last = 0;
  let nextSpawn = 0;

  function seed() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(T.maxNodes, Math.max(10, Math.round(w * h * T.density)));
    const types = ['pc', 'pc', 'router', 'switch'];
    nodes = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
      type: types[i % types.length],
    }));
    packets = [];
  }

  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const neighbours = (a) => nodes.filter((b) => b !== a && dist2(a, b) < LINK_DIST ** 2);

  function spawn(from, count = 1) {
    for (let k = 0; k < count; k++) {
      const next = neighbours(from);
      if (!next.length) return;
      packets.push({
        from, to: next[Math.floor(Math.random() * next.length)], t: 0,
        speed: 0.012 + Math.random() * 0.01, hops: 3 + Math.floor(Math.random() * 4),
        color: T.packets[Math.floor(Math.random() * T.packets.length)],
        bits: Array.from({ length: 4 }, () => (Math.random() < 0.5 ? '0' : '1')).join(''),
      });
    }
  }

  function drawDevice(n, glow) {
    const s = glow ? 1.25 : 1;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = rgba(T.device, glow ? 1.8 : 1);
    ctx.fillStyle = rgba(T.deviceFill);
    ctx.beginPath();
    if (n.type === 'router') {
      ctx.arc(n.x, n.y, 6 * s, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(n.x - 3.5 * s, n.y); ctx.lineTo(n.x + 3.5 * s, n.y);
      ctx.moveTo(n.x, n.y - 3.5 * s); ctx.lineTo(n.x, n.y + 3.5 * s);
      ctx.stroke();
    } else if (n.type === 'switch') {
      ctx.roundRect(n.x - 8 * s, n.y - 3.5 * s, 16 * s, 7 * s, 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.roundRect(n.x - 6.5 * s, n.y - 5 * s, 13 * s, 9 * s, 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(n.x - 3 * s, n.y + 6.5 * s); ctx.lineTo(n.x + 3 * s, n.y + 6.5 * s);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    // links between close devices, fading with distance
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d2 = dist2(nodes[i], nodes[j]);
        if (d2 > LINK_DIST ** 2) continue;
        ctx.strokeStyle = rgba(T.link, 1 - Math.sqrt(d2) / LINK_DIST);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
    // links to the pointer
    const near = new Set();
    if (pointer) {
      for (const n of nodes) {
        const d = Math.sqrt(dist2(n, pointer));
        if (d > POINTER_DIST) continue;
        near.add(n);
        ctx.strokeStyle = rgba(T.pointer, 1 - d / POINTER_DIST);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const n of nodes) drawDevice(n, near.has(n));
    // packets and their bits
    ctx.font = '10px ui-monospace, Consolas, monospace';
    for (const p of packets) {
      const x = p.from.x + (p.to.x - p.from.x) * p.t;
      const y = p.from.y + (p.to.y - p.from.y) * p.t;
      ctx.globalAlpha = T.packetAlpha * Math.min(1, p.hops / 2 + 0.3);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(x - 4, y - 3, 8, 6, 1.5);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(T.bits);
      ctx.fillText(p.bits, x + 7, y - 5);
      ctx.globalAlpha = 1;
    }
  }

  function step(dt) {
    const k = dt / 16.7;
    for (const n of nodes) {
      if (pointer) { // drift gently towards the pointer
        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < POINTER_DIST ** 2 && d2 > 900) { n.vx += dx * 0.000025 * k; n.vy += dy * 0.000025 * k; }
      }
      n.vx = Math.max(-0.35, Math.min(0.35, n.vx * 0.995 + (Math.random() - 0.5) * 0.004));
      n.vy = Math.max(-0.35, Math.min(0.35, n.vy * 0.995 + (Math.random() - 0.5) * 0.004));
      n.x += n.vx * k;
      n.y += n.vy * k;
      if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
      if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
    }
    for (const p of packets) {
      p.t += p.speed * k;
      if (p.t >= 1) { // arrived: hop to a neighbour of the device it reached
        p.hops -= 1;
        const next = neighbours(p.to).filter((n) => n !== p.from);
        if (p.hops <= 0 || !next.length) { p.dead = true; continue; }
        p.from = p.to;
        p.to = next[Math.floor(Math.random() * next.length)];
        p.t = 0;
      }
    }
    packets = packets.filter((p) => !p.dead).slice(-40);
  }

  function loop(now) {
    frame = requestAnimationFrame(loop);
    const dt = now - last;
    if (dt < 33) return; // about 30 frames per second is plenty
    last = now;
    step(Math.min(dt, 100));
    if (now > nextSpawn && nodes.length) {
      spawn(nodes[Math.floor(Math.random() * nodes.length)]);
      nextSpawn = now + 700 + Math.random() * 900;
    }
    draw();
  }

  // ---------- events ----------
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  };
  function onMove(e) {
    const p = local(e);
    pointer = p.inside ? p : null;
  }
  function onDown(e) {
    if (e.target.closest?.(INTERACTIVE)) return; // never compete with a real control
    const p = local(e);
    if (!p.inside || !nodes.length) return;
    let best = nodes[0];
    for (const n of nodes) if (dist2(n, p) < dist2(best, p)) best = n;
    spawn(best, 4);
  }

  seed();
  draw();
  if (reduced) return { stop() {} };
  // A fixed full-page background follows the window (area: null); a box (the hero) follows its own size.
  let timer = null;
  const onResize = () => { clearTimeout(timer); timer = setTimeout(() => { seed(); draw(); }, 150); };
  const resize = area ? new ResizeObserver(onResize) : null;
  if (resize) resize.observe(area);
  else window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else { last = performance.now(); frame = requestAnimationFrame(loop); }
  });
  frame = requestAnimationFrame(loop);
  return {
    stop() {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    },
  };
}
