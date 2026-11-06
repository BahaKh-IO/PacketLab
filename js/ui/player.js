// player.js — step controls: précédent, suivant, lecture/pause, rejouer, speed, keyboard.
// It only knows a step index and a number of steps; onChange(index) does the drawing.

const BASE_DELAY_MS = 1200; // time per step at speed 1×

export function createPlayer(root, onChange) {
  const btn = (a) => root.querySelector(`[data-action="${a}"]`);
  const prevBtn = btn('prev');
  const nextBtn = btn('next');
  const playBtn = btn('play');
  const replayBtn = btn('replay');
  const counter = root.querySelector('[data-role="counter"]');
  const speedSelect = root.querySelector('[data-role="speed"]');

  let count = 0;
  let index = 0;
  let playing = false;
  let timer = null;

  function render() {
    counter.textContent = count ? `Étape ${index + 1} / ${count}` : 'Étape – / –';
    prevBtn.disabled = !count || index === 0;
    nextBtn.disabled = !count || index === count - 1;
    playBtn.disabled = !count;
    replayBtn.disabled = !count;
    playBtn.textContent = playing ? '❚❚ Pause' : '▶ Lecture';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
  }

  function go(i) {
    if (!count) return;
    index = Math.max(0, Math.min(count - 1, i));
    render();
    onChange(index);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (index < count - 1) {
        go(index + 1);
        schedule();
      } else {
        pause();
      }
    }, BASE_DELAY_MS / Number(speedSelect.value));
  }

  function play() {
    if (!count) return;
    if (index >= count - 1) go(0);
    playing = true;
    render();
    schedule();
  }

  function pause() {
    playing = false;
    clearTimeout(timer);
    render();
  }

  const toggle = () => (playing ? pause() : play());
  const step = (delta) => { pause(); go(index + delta); };
  const replay = () => { pause(); go(0); play(); };

  /** New run with n steps: back to the first one. */
  function load(n) {
    pause();
    count = n;
    index = 0;
    render();
    if (count) onChange(0);
  }

  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  playBtn.addEventListener('click', toggle);
  replayBtn.addEventListener('click', replay);
  speedSelect.addEventListener('change', () => { if (playing) schedule(); });

  // Keyboard: ← → steps, space play/pause, R rejouer.
  document.addEventListener('keydown', (e) => {
    if (!count || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replay(); }
  });
  // A focused button would also "click" on space: block that, space is play/pause.
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && e.target.tagName === 'BUTTON') e.preventDefault();
  });

  render();
  return { load, go, play, pause };
}
