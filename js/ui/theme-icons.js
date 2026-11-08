// theme-icons.js — one icon and one accent colour per learning theme, used on the
// quiz, fiches, flashcards and course pages. Purely decorative (aria-hidden).

const NS = 'http://www.w3.org/2000/svg';

// Each icon is a list of [tag, attributes] in a 32×32 box, drawn with the current colour.
const ICONS = {
  'adressage-ip': [['rect', { x: 4, y: 9, width: 24, height: 14, rx: 3 }], ['path', { d: 'M17 9 V23' }], ['circle', { cx: 10.5, cy: 16, r: 2, class: 'f' }], ['circle', { cx: 22.5, cy: 16, r: 2 }]],
  'ethernet-mac': [['path', { d: 'M8 6 H24 V19 H20 V24 H12 V19 H8 Z' }], ['path', { d: 'M12 10 V13 M15 10 V13 M18 10 V13 M21 10 V13' }], ['path', { d: 'M16 24 V28' }]],
  arp: [['circle', { cx: 13, cy: 13, r: 7.5 }], ['path', { d: 'M18.5 18.5 L26 26' }], ['path', { d: 'M10.5 11 C10.5 8.5 15.5 8.5 15.5 11 C15.5 13 13 13 13 15' }], ['circle', { cx: 13, cy: 17.6, r: 0.9, class: 'f' }]],
  commutation: [['rect', { x: 4, y: 10, width: 24, height: 12, rx: 3 }], ['path', { d: 'M9 14.5 H23 M20 12 L23 14.5 L20 17' }], ['path', { d: 'M23 18 H9 M12 15.5 L9 18 L12 20.5' }]],
  routage: [['circle', { cx: 16, cy: 16, r: 11 }], ['path', { d: 'M16 6.5 V12 M13.5 9 L16 6.5 L18.5 9' }], ['path', { d: 'M16 25.5 V20 M13.5 23 L16 25.5 L18.5 23' }], ['path', { d: 'M6.5 16 H12 M9 13.5 L6.5 16 L9 18.5' }], ['path', { d: 'M25.5 16 H20 M23 13.5 L25.5 16 L23 18.5' }]],
  topologies: [['circle', { cx: 16, cy: 16, r: 3.2, class: 'f' }], ['circle', { cx: 6, cy: 7, r: 2.6 }], ['circle', { cx: 26, cy: 7, r: 2.6 }], ['circle', { cx: 6, cy: 25, r: 2.6 }], ['circle', { cx: 26, cy: 25, r: 2.6 }], ['path', { d: 'M8 9 L13.5 14 M24 9 L18.5 14 M8 23 L13.5 18 M24 23 L18.5 18' }]],
  fiabilite: [['rect', { x: 4, y: 11, width: 7, height: 10, rx: 1.5, class: 'f' }], ['rect', { x: 12.5, y: 11, width: 7, height: 10, rx: 1.5 }], ['rect', { x: 21, y: 11, width: 7, height: 10, rx: 1.5, class: 'f' }], ['path', { d: 'M9 7 C 13 3, 20 3, 23 7 M21 4.5 L23 7 L20.5 8.5' }]],
};

/** <svg class="theme-icon"> for a theme id (empty box for an unknown id). */
export function themeIcon(id) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', 'theme-icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[id] ?? []) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

/** Class that sets the theme's accent colour (see .theme-* in style.css). */
export const themeClass = (id) => `theme-${id}`;
