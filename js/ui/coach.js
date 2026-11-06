// coach.js — a box over the drawing that shows teaching bubbles and questions,
// one card at a time. When the last card is closed, onDone() is called.

function h(tag, cls, ...children) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...children.filter((c) => c !== null && c !== undefined));
  return el;
}

export function createCoach(box) {
  let queue = [];
  let onDone = null;

  function next() {
    const card = queue.shift();
    if (!card) {
      box.hidden = true;
      box.replaceChildren();
      const done = onDone;
      onDone = null;
      done?.();
      return;
    }
    box.replaceChildren(card.kind === 'question' ? questionCard(card) : bubbleCard(card));
    box.hidden = false;
    box.querySelector('button')?.focus();
  }

  function bubbleCard(b) {
    const ok = h('button', 'primary', 'Compris');
    ok.type = 'button';
    ok.addEventListener('click', () => { b.onClose?.(); next(); });
    return h('div', 'coach-card coach-bubble',
      h('p', 'coach-kicker', 'À retenir'),
      h('h3', null, b.titre),
      h('p', null, b.texte),
      h('div', 'coach-actions', ok));
  }

  function questionCard(q) {
    const feedback = h('div', 'coach-feedback');
    feedback.hidden = true;
    const choices = h('div', 'coach-choices');
    q.choix.forEach((text, k) => {
      const b = h('button', 'choice', text);
      b.type = 'button';
      b.addEventListener('click', () => {
        for (const other of choices.children) other.disabled = true;
        const good = k === q.bonne;
        b.classList.add(good ? 'right' : 'wrong');
        choices.children[q.bonne].classList.add('right');
        const cont = h('button', 'primary', 'Continuer');
        cont.type = 'button';
        cont.addEventListener('click', () => { q.onAnswer?.(good); next(); });
        feedback.replaceChildren(
          h('p', good ? 'verdict right' : 'verdict wrong', good ? 'Bonne réponse !' : 'Pas tout à fait…'),
          h('p', null, q.explication),
          h('div', 'coach-actions', cont));
        feedback.hidden = false;
        cont.focus();
      });
      choices.append(b);
    });
    return h('div', 'coach-card coach-question',
      h('p', 'coach-kicker', 'Question'),
      h('h3', null, q.enonce),
      choices,
      feedback);
  }

  return {
    /** Show the cards in order, then call done(). */
    show(cards, done) {
      queue = [...cards];
      onDone = done;
      next();
    },
    /** Close without calling done (new run, new topology). */
    clear() {
      queue = [];
      onDone = null;
      box.hidden = true;
      box.replaceChildren();
    },
    get open() { return !box.hidden; },
  };
}
