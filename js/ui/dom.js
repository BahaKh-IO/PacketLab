// dom.js — tiny helpers to build HTML without innerHTML (text is always inserted as text).

/** h('p', 'note', 'Bonjour ', h('strong', null, 'toi')) -> <p class="note">Bonjour <strong>toi</strong></p> */
export function h(tag, cls, ...children) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

/** A link; `href` is always one of our own relative URLs. */
export function link(href, text, cls = null) {
  const a = h('a', cls, text);
  a.href = href;
  return a;
}

/** A <button type="button">. */
export function button(text, cls, onClick) {
  const b = h('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Shuffle a copy of an array (Fisher–Yates). */
export function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
