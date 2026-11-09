// nav.js — loaded on every page: the parts of the page shell that need a script.
//   - the faint living network in the background
//   - the menu button of the header on small screens (on wide screens the menu is always shown)
//   - the light / dark theme button (the theme itself is set early by js/theme-init.js)
//   - a skip link, a reading-progress bar (courses, fiches), a back-to-top button
//   - the ripple of light on buttons when they are clicked
import { startNetworkBackground } from './net-background.js';
import { load, save } from '../storage.js';

const root = document.documentElement;
const isDark = () => root.dataset.theme === 'dark';

// ---------- background ----------
const bg = document.createElement('canvas');
bg.className = 'net-bg';
bg.setAttribute('aria-hidden', 'true');
document.body.prepend(bg);
const network = startNetworkBackground(bg, {
  tone: isDark() ? 'night' : 'light',
  area: null,
  // devices fade out behind these texts, so the page stays easy to read
  avoid: '.page > h1, .intro, .section-title, .filter-note, .scenario-desc, .hint, .page-tabs, .lab-setup legend, .results h2',
});

// ---------- skip link: the first thing a keyboard user reaches ----------
const main = document.querySelector('main');
if (main) {
  if (!main.id) main.id = 'contenu';
  main.tabIndex = -1; // can receive the focus from the skip link
  const skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = `#${main.id}`;
  skip.textContent = 'Aller au contenu';
  document.body.prepend(skip);
}

// ---------- header: menu button and theme button ----------
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

const themeButton = document.createElement('button');
themeButton.type = 'button';
themeButton.className = 'theme-toggle';
themeButton.setAttribute('aria-label', 'Thème sombre');
// moon (shown in the light theme) and sun (shown in the dark theme)
themeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path class="moon" d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>'
  + '<g class="sun"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g></svg>';

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
  themeButton.title = theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre';
  network.setTone(theme === 'dark' ? 'night' : 'light');
}
themeButton.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  save('theme', next); // from now on the student's choice wins over the system setting
  applyTheme(next);
});
// No choice saved yet: follow the system when it changes.
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
  if (load('theme', null) === null) applyTheme(e.matches ? 'dark' : 'light');
});
if (header) header.insertBefore(themeButton, toggle ?? header.querySelector('nav'));
applyTheme(isDark() ? 'dark' : 'light');

// ---------- reading progress (courses and fiches) and back to top ----------
const readBar = document.createElement('div');
readBar.className = 'read-progress';
readBar.setAttribute('aria-hidden', 'true');
readBar.hidden = true;
header?.append(readBar);

// Pages with a fixed player at the bottom (simulator, lab) have no back-to-top button.
const toTop = document.querySelector('.player') ? null : document.createElement('button');
if (toTop) {
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'Revenir en haut de la page');
  toTop.textContent = '↑';
  toTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    (main ?? document.body).focus({ preventScroll: true });
  });
  document.body.append(toTop);
}

let scheduled = false;
function onScroll() {
  scheduled = false;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  readBar.hidden = !document.querySelector('.course, .sheet') || max < 200;
  readBar.style.setProperty('--read', String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
  toTop?.classList.toggle('show', window.scrollY > window.innerHeight * 1.2);
}
window.addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(onScroll); }
}, { passive: true });
onScroll();

// ---------- ripple ----------
// A click (or tap) on a button, a card link, an answer or a chip spreads a circle
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
