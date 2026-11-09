// home.js — home page: the "Reprendre" box, filled from the last scenario saved by the simulator.

import { load } from '../storage.js';
import { startNetworkBackground } from './net-background.js';

// The hero gets its own, brighter network.
const hero = document.querySelector('.hero');
if (hero) {
  const canvas = document.createElement('canvas');
  canvas.className = 'net-bg-hero';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);
  startNetworkBackground(canvas, { tone: 'dark', area: hero });
}

// The terminal: a real ping and traceroute from PC-A to PC-B (the worked example), typed out.
// Commands are typed letter by letter, answers appear line by line.
const TERMINAL = [
  ['cmd', 'ping -c 1 192.168.2.20'],
  ['out', 'PING 192.168.2.20 : 56 octets de données'],
  ['out', '64 octets de 192.168.2.20 : icmp_seq=1 ttl=62 temps=4,1 ms'],
  ['out', '--- 1 paquet transmis, 1 reçu, 0 % de perte ---'],
  ['cmd', 'traceroute 192.168.2.20'],
  ['out', ' 1  192.168.1.1    (R1)    1,2 ms'],
  ['out', ' 2  10.0.0.2       (R2)    2,6 ms'],
  ['out', ' 3  192.168.2.20   (PC-B)  4,0 ms'],
];
const PROMPT = 'PC-A:~$ ';
const screen = document.getElementById('terminal');
if (screen) {
  const full = TERMINAL.map(([kind, text]) => (kind === 'cmd' ? PROMPT + text : text)).join('\n');
  document.getElementById('terminal-text').textContent = `Terminal de PC-A : ${full}`;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let run = 0; // a new run cancels the one in progress

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function type() {
    const me = ++run;
    screen.textContent = '';
    const cursor = document.createElement('span');
    cursor.className = 'terminal-cursor';
    for (const [kind, text] of TERMINAL) {
      if (kind === 'cmd') {
        const line = document.createElement('span');
        line.className = 'terminal-cmd';
        line.textContent = PROMPT;
        screen.append(line, cursor);
        await wait(450);
        for (const ch of text) {
          if (me !== run) return;
          line.textContent += ch;
          await wait(38 + Math.random() * 40);
        }
        await wait(350);
      } else {
        if (me !== run) return;
        const line = document.createElement('span');
        line.className = /ttl=|\(/.test(text) ? 'terminal-out terminal-key' : 'terminal-out';
        line.textContent = text;
        screen.append(line);
        await wait(260);
      }
      screen.append('\n');
    }
    const end = document.createElement('span');
    end.className = 'terminal-cmd';
    end.textContent = PROMPT;
    screen.append(end, cursor);
  }

  if (reduced) {
    screen.textContent = `${full}\n${PROMPT}`;
    document.getElementById('terminal-replay').hidden = true;
  } else {
    // Starts when the terminal scrolls into view.
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen.disconnect();
        type();
      }
    }, { threshold: 0.4 });
    seen.observe(screen);
    document.getElementById('terminal-replay').addEventListener('click', type);
  }
}

const last = load('dernier-scenario', null);
if (last && last.topo && (last.scenario || (last.src && last.dst))) {
  const params = new URLSearchParams(last.scenario
    ? { topo: last.topo, scenario: last.scenario }
    : { topo: last.topo, src: last.src, dst: last.dst });
  if (last.etape) params.set('etape', String(last.etape));
  document.getElementById('resume-link').href = `./simulateur.html?${params}`;
  document.getElementById('resume-text').textContent =
    (last.scenario ? `${last.nom ?? last.topo} — ${last.scenarioNom ?? last.scenario}` : `${last.nom ?? last.topo} : ${last.src} → ${last.dst}`) +
    (last.etape ? `, étape ${last.etape} / ${last.total}` : '');
  document.getElementById('resume').hidden = false;
}
