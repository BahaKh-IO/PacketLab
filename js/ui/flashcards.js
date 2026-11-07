// flashcards.js — a deck of flashcards: read the front, flip, say "Je savais" or "À revoir".
// Cards marked as known are saved by progress.js; "À revoir" cards come back at the end of the round.

import { h, button, shuffled } from './dom.js';
import { getProgress, setCardKnown } from '../progress.js';

export function createFlashcards(root, cards) {
  let onlyToReview = false;
  let queue = [];
  let flipped = false;

  const knownIds = () => new Set(Object.values(getProgress().cartes).flat());

  function start() {
    const known = knownIds();
    queue = shuffled(onlyToReview ? cards.filter((c) => !known.has(c.id)) : cards);
    render();
  }

  function render() {
    const known = knownIds();
    const total = cards.length;
    const nKnown = cards.filter((c) => known.has(c.id)).length;
    const counter = h('p', 'deck-count', `${nKnown} / ${total} cartes sues`);
    const toggle = h('label', 'deck-toggle',
      Object.assign(h('input'), { type: 'checkbox', checked: onlyToReview }),
      ' seulement les cartes à revoir');
    toggle.querySelector('input').addEventListener('change', (e) => { onlyToReview = e.target.checked; start(); });

    if (!queue.length) {
      root.replaceChildren(counter, toggle, h('div', 'flashcard flashcard-done',
        h('p', null, onlyToReview && nKnown === total ? 'Toutes les cartes de ce paquet sont sues. Bravo !' : 'Paquet terminé.'),
        button('Recommencer', 'primary', start)));
      return;
    }
    const card = queue[0];
    flipped = false;
    const face = h('button', 'flashcard', h('span', 'flash-side', 'Question'), h('span', 'flash-text', card.recto),
      h('span', 'flash-hint', 'Cliquer ou Espace pour retourner'));
    face.type = 'button';
    face.setAttribute('aria-label', `Carte : ${card.recto}. Appuyer pour voir la réponse.`);
    const actions = h('div', 'deck-actions');
    actions.hidden = true;
    const yes = button('Je savais', 'primary', () => answer(true));
    const no = button('À revoir', null, () => answer(false));
    actions.append(no, yes);

    function flip() {
      if (flipped) return;
      flipped = true;
      face.classList.add('flipped');
      face.replaceChildren(h('span', 'flash-side', card.recto), h('span', 'flash-text', card.verso));
      face.setAttribute('aria-label', `Réponse : ${card.verso}`);
      actions.hidden = false;
      yes.focus();
    }

    function answer(knew) {
      setCardKnown(card.theme, card.id, knew);
      queue.shift();
      if (!knew) queue.push(card); // seen again at the end of this round
      render();
    }

    face.addEventListener('click', flip);
    root.onkeydown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); flip(); }
    };
    root.replaceChildren(counter, toggle, h('p', 'deck-left', `Encore ${queue.length} carte${queue.length > 1 ? 's' : ''} dans ce tour`), face, actions);
    face.focus();
  }

  start();
}
