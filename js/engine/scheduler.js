// scheduler.js — the event queue of the discrete-event simulation. No DOM.
//
// The queue is an array kept sorted by simulated time `t`. When two items
// have the same time, the one scheduled first runs first (insertion order),
// so the same input always produces the same run.

export class Scheduler {
  constructor() {
    this.now = 0;     // current simulated time (ms)
    this.queue = [];  // items { t, seq, action }, sorted by t then seq
    this.seq = 0;     // insertion counter, used only to break ties
  }

  /** Run `action` at absolute simulated time `t`. */
  at(t, action) {
    const item = { t, seq: this.seq++, action };
    // Find the first item strictly later than t: inserting there puts the
    // new item after every item with the same time.
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].t > t) i--;
    this.queue.splice(i, 0, item);
  }

  /** Run `action` `delay` ms after the current time. */
  after(delay, action) {
    this.at(this.now + delay, action);
  }

  get size() {
    return this.queue.length;
  }

  /** Take the earliest item, move the clock to its time and run it. */
  step() {
    const item = this.queue.shift();
    this.now = item.t;
    item.action();
  }

  /** Run until the queue is empty (or `maxSteps` as a safety net). */
  run(maxSteps = 10000) {
    let steps = 0;
    while (this.queue.length > 0) {
      if (steps++ >= maxSteps) throw new Error('Scheduler: too many steps (loop in the topology?)');
      this.step();
    }
  }
}
