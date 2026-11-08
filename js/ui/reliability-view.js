// reliability-view.js — one "lane" of the Labo fiabilité: the network strip,
// the sender cells and the receiver cells. It only reads the output of
// simulateReliability(): events (state at each moment) and trajets (moves).

const NS = 'http://www.w3.org/2000/svg';
const X = { E: 70, RA: 270, RB: 470, R: 670 }; // node positions on the strip
const LINE_Y = 70;
const NODES = [['E', 'Émetteur'], ['RA', 'Routeur A'], ['RB', 'Routeur B'], ['R', 'Récepteur']];
const ETATS = { attente: 'en attente', envoye: 'envoyé', expire: 'délai expiré', confirme: 'confirmé' };

function svgEl(tag, attrs = {}, text = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

function h(tag, cls, ...children) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...children.filter((c) => c !== null && c !== undefined));
  return el;
}

/** Spaces made visible in chunk texts. */
export const visible = (s) => s.replace(/ /g, '␣');

export function createLane(root, run, titre) {
  const { morceaux, events, trajets } = run;
  const initial = {
    emetteur: morceaux.map(() => 'attente'),
    recepteur: morceaux.map(() => null),
    pertes: [],
  };

  // ---------- static parts ----------
  const svg = svgEl('svg', { viewBox: '0 0 740 150', class: 'strip', role: 'img', 'aria-label': `Réseau : ${titre}` });
  svg.append(svgEl('line', { x1: X.E, y1: LINE_Y, x2: X.R, y2: LINE_Y, class: 'strip-line' }));
  for (const [id, label] of NODES) {
    const g = svgEl('g', { transform: `translate(${X[id]} ${LINE_Y})`, class: `strip-node strip-${id}` });
    if (id === 'RA' || id === 'RB') g.append(svgEl('circle', { r: 20, class: 'shape' }));
    else g.append(svgEl('rect', { x: -24, y: -18, width: 48, height: 36, rx: 6, class: 'shape' }));
    g.append(svgEl('text', { y: 44, 'text-anchor': 'middle', class: 'strip-label' }, label));
    svg.append(g);
  }
  const lossLayer = svgEl('g');
  const tokenLayer = svgEl('g');
  svg.append(lossLayer, tokenLayer);

  const senderRow = h('div', 'cells');
  const receiverRow = h('div', 'cells');
  const notes = h('ul', 'lane-notes');
  notes.setAttribute('aria-live', 'polite');
  root.replaceChildren(
    h('h2', 'lane-title', titre),
    h('div', 'strip-wrap', svg),
    h('div', 'cells-row', h('span', 'row-label', 'Émetteur'), senderRow),
    h('div', 'cells-row', h('span', 'row-label', 'Récepteur'), receiverRow),
    notes,
  );

  // ---------- dynamic parts ----------

  /** State after the last event at or before time T. */
  function stateAt(T) {
    let s = initial;
    for (const e of events) {
      if (e.t > T) break;
      s = e.etat;
    }
    return s;
  }

  /** Draw every chunk and ACK where it is at time tau (interpolated along its move). */
  function drawTokens(tau) {
    tokenLayer.replaceChildren();
    for (const tr of trajets) {
      if (!(tr.t0 <= tau && tau < tr.t1)) continue;
      const k = (tau - tr.t0) / (tr.t1 - tr.t0);
      const x = X[tr.de] + (X[tr.vers] - X[tr.de]) * k;
      if (tr.kind === 'ack') {
        const g = svgEl('g', { transform: `translate(${x} ${LINE_Y + 22})`, class: 'token token-ack' });
        g.append(svgEl('rect', { x: -15, y: -9, width: 30, height: 18, rx: 9 }));
        g.append(svgEl('text', { y: 4, 'text-anchor': 'middle' }, `A${tr.numero}`));
        tokenLayer.append(g);
      } else {
        const y = tr.fin === 'retenu' ? LINE_Y - 50 : LINE_Y - 24;
        const cls = ['token', 'token-chunk'];
        if (tr.essai > 1) cls.push('token-resend');
        if (tr.fin === 'retenu') cls.push('token-held');
        const g = svgEl('g', { transform: `translate(${x} ${y})`, class: cls.join(' ') });
        g.append(svgEl('rect', { x: -12, y: -11, width: 24, height: 22, rx: 4 }));
        g.append(svgEl('text', { y: 5, 'text-anchor': 'middle' }, String(tr.numero)));
        if (tr.fin === 'retenu') g.append(svgEl('title', {}, `Morceau ${tr.numero} retenu au routeur A`));
        tokenLayer.append(g);
      }
    }
  }

  function drawState(s, T, final) {
    // Lost chunks: crossed boxes under router B.
    lossLayer.replaceChildren();
    s.pertes.forEach((p, k) => {
      const g = svgEl('g', { transform: `translate(${X.RB - 30 + k * 30} ${LINE_Y - 52})`, class: 'loss' });
      g.append(svgEl('rect', { x: -12, y: -11, width: 24, height: 22, rx: 4 }));
      g.append(svgEl('text', { y: 5, 'text-anchor': 'middle' }, String(p.numero)));
      g.append(svgEl('path', { d: 'M-14,-13 L14,13 M14,-13 L-14,13', class: 'loss-cross' }));
      g.append(svgEl('title', {}, `Morceau ${p.numero} perdu au routeur B`));
      lossLayer.append(g);
    });

    const here = events.filter((e) => e.t === T);
    // A timeout and its resend happen at the same instant: show the cell as expired during that instant.
    const expired = new Set(here.filter((e) => e.type === 'timeout').map((e) => e.numero));
    senderRow.replaceChildren(...s.emetteur.map((st, i) => {
      const etat = expired.has(i + 1) ? 'expire' : st;
      const c = h('span', `cell sender-${etat}`, String(i + 1));
      c.title = `Morceau ${i + 1} : ${ETATS[etat]}`;
      return c;
    }));

    receiverRow.replaceChildren(...s.recepteur.map((cell, i) => {
      if (cell) {
        const c = h('span', 'cell recv-full', h('span', 'cell-text', visible(cell.texte)), h('sup', 'cell-order', String(cell.ordre)));
        c.title = `Case ${i + 1} : « ${cell.texte} », arrivé en position ${cell.ordre}`;
        return c;
      }
      const c = h('span', final ? 'cell recv-hole' : 'cell recv-empty', String(i + 1));
      c.title = final ? `Case ${i + 1} : morceau manquant` : `Case ${i + 1} : vide`;
      return c;
    }));

    const last = events.at(-1);
    const shown = here.length ? here
      : T > last.t ? [{ type: last.type, note: `Terminé à ${last.t} ms. ${last.note}` }]
      : [{ note: '—' }];
    notes.replaceChildren(...shown.map((e) => h('li', e.type ? `note-${e.type}` : null, e.note)));
  }

  let frame = null;

  /** Show the lane at time T; tokens glide from fromT to T in `duration` ms. */
  function show(T, fromT, duration, final = false) {
    cancelAnimationFrame(frame);
    drawState(stateAt(T), T, final && T >= events.at(-1).t);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || duration <= 0 || fromT >= T) {
      drawTokens(T);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      drawTokens(fromT + (T - fromT) * k);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  return { show };
}

/** Results table: one column per run. */
export function renderResults(table, runs, labels) {
  const head = h('tr', null, h('th', null, 'Mesure'), ...runs.map((r) => h('th', null, labels[r.result.mode])));
  const rows = [
    ['Message complet', (r) => (r.complet ? '✔ oui' : '✘ non'), (r) => (r.complet ? 'good' : 'bad')],
    ['Message reçu', (r) => visible(r.messageRecu), () => 'mono'],
    ['Temps total (ms)', (r) => String(r.tempsTotal), () => null],
    ['Transmissions', (r) => String(r.transmissions), () => null],
    ['Retransmissions', (r) => String(r.retransmissions), () => null],
    ['Doublons reçus', (r) => String(r.doublons), () => null],
  ];
  const body = rows.map(([label, value, cls]) =>
    h('tr', null, h('th', null, label), ...runs.map((r) => h('td', cls(r.result), value(r.result)))));
  table.replaceChildren(h('thead', null, head), h('tbody', null, ...body));
}
