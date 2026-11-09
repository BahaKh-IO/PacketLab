// net-background.js — a living network drawn behind the pages: devices drift, link up when
// they come close, and packets hop from device to device trailing their bits.
// Interactive: devices near the pointer light up and link to it; a click on an empty area
// sends a burst of packets from the nearest device. Decorative only (aria-hidden, no pointer
// events on the canvas). With prefers-reduced-motion it draws one still frame.

const TONES = {
  // Reading pages: big, soft devices on the light "blueprint" backdrop.
  light: {
    scale: 2.7, linkDist: 290, pointerDist: 300, density: 1 / 70000, minNodes: 8, maxNodes: 22,
    link: [79, 109, 196, 0.16], linkWidth: 1.6,
    device: [91, 120, 205, 0.42], deviceFill: [255, 255, 255, 0.78], detail: [91, 120, 205, 0.28],
    glow: [8, 145, 178, 0.95], glowFill: [236, 254, 255, 0.95],
    pointer: [8, 145, 178, 0.35], packets: ['#0891b2', '#7c3aed', '#2563eb'], bits: [55, 80, 160, 0.6],
    packetAlpha: 0.85, packetSize: 1.7, bitsFont: 12,
  },
  // Reading pages in the dark theme: the same big devices, drawn in light lines on the night backdrop.
  night: {
    scale: 2.7, linkDist: 290, pointerDist: 300, density: 1 / 70000, minNodes: 8, maxNodes: 22,
    link: [103, 232, 249, 0.1], linkWidth: 1.6,
    device: [129, 140, 248, 0.4], deviceFill: [10, 22, 46, 0.85], detail: [129, 140, 248, 0.26],
    glow: [34, 211, 238, 1], glowFill: [8, 30, 52, 0.95],
    pointer: [34, 211, 238, 0.35], packets: ['#22d3ee', '#a78bfa', '#60a5fa'], bits: [165, 243, 252, 0.5],
    packetAlpha: 0.9, packetSize: 1.7, bitsFont: 12,
  },
  // Home hero: smaller, brighter devices on the dark background.
  dark: {
    scale: 1, linkDist: 150, pointerDist: 170, density: 1 / 14000, minNodes: 10, maxNodes: 60,
    link: [103, 232, 249, 0.13], linkWidth: 1,
    device: [165, 180, 252, 0.42], deviceFill: [11, 29, 58, 0.9], detail: [165, 180, 252, 0.3],
    glow: [34, 211, 238, 1], glowFill: [11, 29, 58, 0.95],
    pointer: [34, 211, 238, 0.4], packets: ['#22d3ee', '#a78bfa', '#60a5fa'], bits: [165, 243, 252, 0.55],
    packetAlpha: 0.95, packetSize: 1, bitsFont: 10,
  },
};
const rgba = ([r, g, b, a], k = 1) => `rgba(${r},${g},${b},${Math.min(1, a * k)})`;
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role=button], [role=tab], .topology, .strip, .flashcard, .card, .panel, .quiz-card, .sheet, .course';

export function startNetworkBackground(canvas, { tone = 'light', area = canvas.parentElement, avoid = null } = {}) {
  let T = TONES[tone];
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
  let obstacles = []; // screen boxes of the texts to keep clear (titles, intros)

  function seed() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(T.maxNodes, Math.max(T.minNodes, Math.round(w * h * T.density)));
    const types = ['pc', 'router', 'pc', 'switch'];
    nodes = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
      type: types[i % types.length],
      lit: 0, // 0..1: how much the device glows (near the pointer, or when a packet arrives)
    }));
    packets = [];
  }

  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const neighbours = (a) => nodes.filter((b) => b !== a && dist2(a, b) < T.linkDist ** 2);

  function spawn(from, count = 1) {
    for (let k = 0; k < count; k++) {
      const next = neighbours(from);
      if (!next.length) return;
      packets.push({
        from, to: next[Math.floor(Math.random() * next.length)], t: 0,
        speed: (0.009 + Math.random() * 0.008) * (150 / T.linkDist) * 1.6,
        hops: 3 + Math.floor(Math.random() * 4),
        color: T.packets[Math.floor(Math.random() * T.packets.length)],
        bits: Array.from({ length: 4 }, () => (Math.random() < 0.5 ? '0' : '1')).join(''),
      });
    }
    from.lit = 1;
  }

  /** One device, drawn around (0, 0) at size s, then placed at (n.x, n.y). */
  function drawDevice(n) {
    const s = T.scale * (1 + n.lit * 0.12);
    const stroke = n.lit > 0.05 ? rgba(T.glow, 0.45 + n.lit * 0.55) : rgba(T.device);
    ctx.save();
    ctx.globalAlpha = n.fade ?? 1;
    ctx.translate(n.x, n.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4 * Math.sqrt(T.scale);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = n.lit > 0.05 ? rgba(T.glowFill) : rgba(T.deviceFill);
    if (n.lit > 0.05) { ctx.shadowColor = rgba(T.glow, n.lit); ctx.shadowBlur = 18 * n.lit; }
    ctx.beginPath();
    if (n.type === 'router') {
      ctx.arc(0, 0, 7 * s, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = n.lit > 0.05 ? stroke : rgba(T.detail);
      ctx.beginPath();
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { // four arrows
        ctx.moveTo(dx * 2 * s, dy * 2 * s);
        ctx.lineTo(dx * 5 * s, dy * 5 * s);
        ctx.moveTo(dx * 5 * s + dy * 1.4 * s, dy * 5 * s + dx * 1.4 * s);
        ctx.lineTo(dx * 5 * s, dy * 5 * s);
        ctx.lineTo(dx * 5 * s - dy * 1.4 * s, dy * 5 * s - dx * 1.4 * s);
      }
      ctx.stroke();
    } else if (n.type === 'switch') {
      ctx.roundRect(-10 * s, -4.5 * s, 20 * s, 9 * s, 2.2 * s);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = n.lit > 0.05 ? stroke : rgba(T.detail);
      for (let p = 0; p < 5; p++) ctx.fillRect((-7.4 + p * 3.2) * s, 1 * s, 1.8 * s, 1.6 * s); // ports
    } else {
      ctx.roundRect(-8 * s, -6 * s, 16 * s, 11 * s, 2 * s); // monitor
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = n.lit > 0.05 ? stroke : rgba(T.detail);
      ctx.beginPath();
      ctx.roundRect(-6 * s, -4 * s, 12 * s, 7 * s, 1 * s); // screen
      ctx.moveTo(-2 * s, 5 * s); ctx.lineTo(-3 * s, 8 * s); // stand
      ctx.moveTo(2 * s, 5 * s); ctx.lineTo(3 * s, 8 * s);
      ctx.moveTo(-4.5 * s, 8 * s); ctx.lineTo(4.5 * s, 8 * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    // links between close devices, fading with distance
    ctx.lineWidth = T.linkWidth;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d2 = dist2(nodes[i], nodes[j]);
        if (d2 > T.linkDist ** 2) continue;
        ctx.strokeStyle = rgba(T.link, (1 - Math.sqrt(d2) / T.linkDist) * Math.min(nodes[i].fade ?? 1, nodes[j].fade ?? 1));
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
    // dashed links to the pointer
    if (pointer) {
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.4;
      for (const n of nodes) {
        const d = Math.sqrt(dist2(n, pointer));
        if (d > T.pointerDist) continue;
        ctx.strokeStyle = rgba(T.pointer, 1 - d / T.pointerDist);
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    for (const n of nodes) drawDevice(n);
    // packets and their bits
    const ps = T.packetSize;
    ctx.font = `600 ${T.bitsFont}px ui-monospace, Consolas, monospace`;
    for (const p of packets) {
      const x = p.from.x + (p.to.x - p.from.x) * p.t;
      const y = p.from.y + (p.to.y - p.from.y) * p.t;
      ctx.globalAlpha = T.packetAlpha * Math.min(1, p.hops / 2 + 0.35);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(x - 5 * ps, y - 3.5 * ps, 10 * ps, 7 * ps, 2 * ps);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(T.bits);
      ctx.fillText(p.bits, x + 7 * ps, y - 5 * ps);
      ctx.globalAlpha = 1;
    }
  }

  /** Boxes of the texts the devices must not clutter (relative to the canvas), slightly enlarged. */
  function measureObstacles() {
    if (!avoid) return;
    const c = canvas.getBoundingClientRect();
    obstacles = [...document.querySelectorAll(avoid)].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.bottom > c.top && r.top < c.bottom)
      .map((r) => ({ x1: r.left - c.left - 30, y1: r.top - c.top - 24, x2: r.right - c.left + 30, y2: r.bottom - c.top + 24 }));
  }
  const behindText = (n) => obstacles.some((o) => n.x > o.x1 && n.x < o.x2 && n.y > o.y1 && n.y < o.y2);

  function step(dt) {
    const k = dt / 16.7;
    measureObstacles();
    for (const n of nodes) {
      n.fade = (n.fade ?? 1) + ((behindText(n) ? 0.15 : 1) - (n.fade ?? 1)) * Math.min(1, 0.12 * k); // fade behind text
      const near = pointer && dist2(n, pointer) < T.pointerDist ** 2;
      if (near) { // drift gently towards the pointer, and light up
        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        if (dx * dx + dy * dy > (40 * T.scale) ** 2) { n.vx += dx * 0.00002 * k; n.vy += dy * 0.00002 * k; }
        n.lit = Math.min(1, n.lit + 0.08 * k);
      } else {
        n.lit = Math.max(0, n.lit - 0.03 * k);
      }
      n.vx = Math.max(-0.3, Math.min(0.3, n.vx * 0.995 + (Math.random() - 0.5) * 0.004));
      n.vy = Math.max(-0.3, Math.min(0.3, n.vy * 0.995 + (Math.random() - 0.5) * 0.004));
      n.x += n.vx * k;
      n.y += n.vy * k;
      const m = 30 * T.scale;
      if (n.x < -m) n.x = w + m; else if (n.x > w + m) n.x = -m;
      if (n.y < -m) n.y = h + m; else if (n.y > h + m) n.y = -m;
    }
    for (const p of packets) {
      p.t += p.speed * k;
      if (p.t >= 1) { // arrived: the device flashes, the packet hops on
        p.to.lit = Math.max(p.to.lit, 0.7);
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
      nextSpawn = now + 900 + Math.random() * 1100;
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
    if (e.target.closest?.(INTERACTIVE)) return; // never compete with a real control or a card
    const p = local(e);
    if (!p.inside || !nodes.length) return;
    let best = nodes[0];
    for (const n of nodes) if (dist2(n, p) < dist2(best, p)) best = n;
    spawn(best, 4);
  }

  seed();
  measureObstacles();
  for (const n of nodes) n.fade = behindText(n) ? 0.15 : 1;
  draw();
  /** Same network, other colours (light / dark theme). */
  const setTone = (name) => {
    T = TONES[name] ?? T;
    draw();
  };
  if (reduced) return { stop() {}, setTone };
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
    setTone,
    stop() {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    },
  };
}
