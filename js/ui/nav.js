// nav.js — the menu button of the header on small screens (on wide screens the menu is always shown).
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
