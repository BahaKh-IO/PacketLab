// nav.js — loaded on every page: the menu button of the header on small screens
// (on wide screens the menu is always shown), and the faint network in the background.
import { startNetworkBackground } from './net-background.js';

const bg = document.createElement('canvas');
bg.className = 'net-bg';
bg.setAttribute('aria-hidden', 'true');
document.body.prepend(bg);
startNetworkBackground(bg, {
  tone: 'light',
  area: null,
  // devices fade out behind these texts, so the page stays easy to read
  avoid: '.page > h1, .intro, .section-title, .filter-note, .scenario-desc, .hint, .page-tabs, .lab-setup legend, .results h2',
});

const toggle = document.querySelector('.nav-toggle');
const header = document.querySelector('.site-header');

function setOpen(open) {
  header.classList.toggle('nav-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
}

if (toggle && header) {
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('nav-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  header.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
}

// Ripple: a click (or tap) on a button, a card link, an answer or a chip spreads a circle
// of light from the exact point of the click. Purely visual; skipped with reduced motion.
const RIPPLE_ON = 'button, a.button, .button, .card-link, .quiz-sim-link, .choice, .chip, .flashcard';
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('pointerdown', (e) => {
  if (reducedMotion || e.button !== 0) return;
  const el = e.target.closest(RIPPLE_ON);
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.style.overflow = 'hidden';
  const dot = document.createElement('span');
  dot.className = 'ripple';
  // dark ripple on light buttons, light ripple on coloured or dark ones
  const bg = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0, 0];
  const light = (bg[3] ?? 1) > 0.3 && bg[0] + bg[1] + bg[2] > 600 && !el.classList.contains('primary');
  if (light || el.matches('.card-link, .quiz-sim-link')) dot.classList.add('on-light');
  dot.style.left = `${e.clientX - r.left}px`;
  dot.style.top = `${e.clientY - r.top}px`;
  dot.style.setProperty('--ripple-size', String(Math.ceil((Math.hypot(r.width, r.height) * 2) / 12)));
  el.append(dot);
  setTimeout(() => dot.remove(), 650);
});
