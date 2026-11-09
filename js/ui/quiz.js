// quiz.js — quiz.html: choose a theme, one question at a time, correction after
// each answer, final score with the questions to review. The score is saved by progress.js.

import { h, link, button, shuffled } from './dom.js';
import { loadThemes, loadQuiz, loadError } from './content.js';
import { themeIcon, themeClass } from './theme-icons.js';
import { getProgress, recordQuiz } from '../progress.js';
import { startSync } from '../account.js';

startSync(); // logged-in students: progress kept in sync with their account

const $ = (id) => document.getElementById(id);
const app = $('quiz-app');
let themes = [];

function show(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo({ top: 0 });
}

// ---------- theme list ----------

function themeList() {
  const progress = getProgress().quiz;
  const cards = themes.map((t) => {
    const best = progress[t.id];
    return h('article', `card quiz-theme ${themeClass(t.id)}`,
      themeIcon(t.id),
      h('h2', 'card-title', t.titre),
      h('p', null, t.resume),
      h('p', 'quiz-best', best ? `Meilleur score : ${best.meilleur} / ${best.total} (${best.tentatives} essai${best.tentatives > 1 ? 's' : ''})` : 'Pas encore tenté'),
      t.statut === 'a-valider' ? h('p', 'badge-review', 'Des erreurs restent possibles : en cas de doute, vérifiez auprès de votre enseignante.') : null,
      link(`./quiz.html?theme=${t.id}`, 'Commencer →', 'button primary'));
  });
  show(h('div', 'cards', cards));
  history.replaceState(null, '', './quiz.html');
}

// ---------- one quiz ----------

async function runQuiz(theme) {
  let data;
  try {
    data = await loadQuiz(theme.id);
  } catch (err) {
    show(h('p', 'error', loadError(err)));
    return;
  }
  const questions = shuffled(data.questions);
  const missed = [];
  const results = []; // true / false per answered question, for the segments
  let score = 0;
  let index = 0;

  function question() {
    const q = questions[index];
    // Choices shuffled for each student; the right one is tracked by its text.
    const choices = shuffled(q.choix.map((text, k) => ({ text, right: k === q.bonne })));
    const feedback = h('div', 'quiz-feedback');
    feedback.hidden = true;
    const buttons = choices.map((c, k) => button(`${k + 1}. ${c.text}`, 'choice', () => answer(c, k)));
    const list = h('div', 'quiz-choices', buttons);

    function answer(choice, k) {
      if (!feedback.hidden) return;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (choices[j].right) b.classList.add('right');
      });
      if (choice.right) score += 1;
      else {
        buttons[k].classList.add('wrong');
        missed.push(q);
      }
      results.push(choice.right);
      steps.children[index].className = choice.right ? 'step-right' : 'step-wrong';
      meta.textContent = metaText();
      const last = index === questions.length - 1;
      const next = button(last ? 'Voir mon score' : 'Question suivante', 'primary', () => {
        if (last) end();
        else { index += 1; question(); }
      });
      feedback.replaceChildren(...[ // (replaceChildren would print "null": filter it out)
        h('p', choice.right ? 'verdict right' : 'verdict wrong', choice.right ? 'Bonne réponse !' : 'Pas tout à fait…'),
        h('p', null, q.explication),
        q.simulateur ? link(q.simulateur, 'Voir dans le simulateur →', 'quiz-sim-link') : null,
        h('div', 'quiz-actions', next)].filter(Boolean));
      feedback.hidden = false;
      next.focus();
    }

    // One segment per question: right / wrong for the answered ones, the current one lit.
    // Decorative: the same facts are written in the line above.
    const steps = h('div', 'quiz-steps', questions.map((_, k) => h('span',
      k < index ? (results[k] ? 'step-right' : 'step-wrong') : k === index ? 'step-current' : null)));
    steps.setAttribute('aria-hidden', 'true');
    const metaText = () => `${theme.titre} · question ${index + 1} / ${questions.length} · ${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''}`;
    const meta = h('p', 'quiz-meta', metaText());
    show(h('section', `quiz-card ${themeClass(theme.id)}`,
      meta,
      steps,
      h('h2', null, q.enonce),
      list,
      feedback,
      h('p', 'quiz-keys', 'Clavier : touches 1 à 4 pour répondre, Entrée pour continuer.')));
    buttons[0].focus();

    // Keys 1–4 answer; Enter on the focused "next" button continues.
    app.onkeydown = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= buttons.length && feedback.hidden) {
        e.preventDefault();
        answer(choices[n - 1], n - 1);
      }
    };
  }

  function end() {
    app.onkeydown = null;
    recordQuiz(theme.id, score, questions.length);
    const ratio = score / questions.length;
    const message = ratio === 1 ? 'Parfait, tout est juste !'
      : ratio >= 0.75 ? 'Très bien : relisez les quelques points ci-dessous.'
        : ratio >= 0.5 ? 'C\'est un début : la fiche et le cours de ce thème vous aideront.'
          : 'Reprenez la fiche et le cours de ce thème, puis réessayez.';
    if (ratio === 1) celebrate();
    show(h('section', `quiz-card quiz-end ${themeClass(theme.id)}`,
      h('p', 'quiz-meta', theme.titre),
      scoreRing(score, questions.length),
      h('h2', null, `Score : ${score} / ${questions.length}`),
      h('p', null, message),
      missed.length ? h('div', 'quiz-review',
        h('h3', null, 'À revoir'),
        missed.map((q) => h('div', 'review-item',
          h('p', 'review-q', q.enonce),
          h('p', 'review-a', `Réponse : ${q.choix[q.bonne]}`),
          h('p', null, q.explication),
          q.simulateur ? link(q.simulateur, 'Voir dans le simulateur →') : null))) : null,
      h('div', 'quiz-actions',
        button('Recommencer', 'primary', () => runQuiz(theme)),
        link(`./cours.html?theme=${theme.id}`, 'Lire le cours', 'button'),
        link(`./fiches.html?theme=${theme.id}`, 'Fiches et cartes', 'button'),
        link('./quiz.html', 'Autres thèmes', 'button'))));
  }

  history.replaceState(null, '', `./quiz.html?theme=${theme.id}`);
  question();
}

/** A ring that fills up to the score (decorative: the score is also written as text). */
function scoreRing(score, total) {
  const NS = 'http://www.w3.org/2000/svg';
  const r = 34;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 80 80');
  svg.setAttribute('class', 'score-ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(NS, 'circle');
  const arc = document.createElementNS(NS, 'circle');
  for (const el of [track, arc]) { el.setAttribute('cx', 40); el.setAttribute('cy', 40); el.setAttribute('r', r); }
  track.setAttribute('class', 'track');
  arc.setAttribute('class', 'arc');
  arc.setAttribute('stroke-dasharray', `${(score / total) * c} ${c}`);
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', 40); text.setAttribute('y', 46); text.setAttribute('text-anchor', 'middle');
  const pct = Math.round((score / total) * 100);
  text.textContent = `${pct} %`;
  svg.append(track, arc, text);
  // The number counts up with the ring (the final value is there from the start for reduced motion).
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / 900);
      text.textContent = `${Math.round(pct * (1 - (1 - k) ** 3))} %`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return svg;
}

/** A perfect score: a short burst of confetti (decorative; skipped with reduced motion). */
function celebrate() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#22d3ee', '#3b82f6', '#8b5cf6', '#f472b6', '#fbbf24', '#4ade80'];
  const layer = h('div', 'confetti');
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 70; i++) {
    const p = h('i', null);
    p.style.setProperty('--x', `${Math.random() * 100}vw`);
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 30}vw`);
    p.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
    p.style.setProperty('--delay', `${Math.random() * 0.5}s`);
    p.style.setProperty('--time', `${1.8 + Math.random() * 1.4}s`);
    p.style.background = colors[i % colors.length];
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4000);
}

async function init() {
  try {
    themes = (await loadThemes()).themes;
  } catch (err) {
    show(h('p', 'error', loadError(err)));
    return;
  }
  const wanted = themes.find((t) => t.id === new URLSearchParams(location.search).get('theme'));
  if (wanted) runQuiz(wanted);
  else themeList();
}

init();
