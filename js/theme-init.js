// theme-init.js — a classic (non-module) script loaded in <head> on every page, before the CSS
// is applied, so a dark page never flashes white. It only sets <html data-theme="dark|light">:
// the student's choice (saved by nav.js as "packetlab.theme"), or else the system setting.
(function () {
  var theme = null;
  try {
    theme = JSON.parse(localStorage.getItem('packetlab.theme'));
  } catch (e) {
    // storage blocked: follow the system
  }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
