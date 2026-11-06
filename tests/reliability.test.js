// Module B engine tests (docs/PLAN.md, Session 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateReliability, decouper } from '../js/engine/reliability.js';

const MESSAGE = "Rendez-vous à SUP'COM à 10h";
const run = (mode, incidents = []) => simulateReliability({ message: MESSAGE, mode, incidents });

test('message split into numbered chunks of 4 characters', () => {
  const m = decouper(MESSAGE, 4);
  assert.equal(m.length, 7);
  assert.deepEqual(m[0], { numero: 1, texte: 'Rend' });
  assert.deepEqual(m[3], { numero: 4, texte: 'à SU' });
  assert.equal(m.at(-1).texte, '10h');
  assert.equal(m.map((x) => x.texte).join(''), MESSAGE);
});

test('no incident: both modes complete, 0 retransmission', () => {
  for (const mode of ['sans', 'avec']) {
    const { result } = run(mode);
    assert.equal(result.complet, true, mode);
    assert.equal(result.messageRecu, MESSAGE);
    assert.equal(result.transmissions, 7);
    assert.equal(result.retransmissions, 0);
    assert.equal(result.doublons, 0);
  }
});

test('lose chunk 3 without recovery: the message keeps a hole', () => {
  const { result, events } = run('sans', [{ morceau: 3, action: 'perdre' }]);
  assert.equal(result.complet, false);
  assert.equal(result.retransmissions, 0);
  assert.equal(result.messageRecu, "Rendez-v□□□□à SUP'COM à 10h"); // chunk 3 is "ous "
  const perte = events.find((e) => e.type === 'perte');
  assert.equal(perte.numero, 3);
  assert.equal(perte.lieu, 'RB');
  assert.equal(events.at(-1).type, 'fin');
});

test('lose chunk 3 with recovery: exactly 1 retransmission, message complete', () => {
  const { result, events } = run('avec', [{ morceau: 3, action: 'perdre' }]);
  assert.equal(result.complet, true);
  assert.equal(result.messageRecu, MESSAGE);
  assert.equal(result.retransmissions, 1);
  assert.equal(result.transmissions, 8);
  assert.equal(result.doublons, 0);
  // Order of what happens to chunk 3: sent, lost, timeout, sent again (2nd), received
  // (it is the last missing chunk, so the message is complete), ACKed.
  const c3 = events.filter((e) => e.numero === 3).map((e) => `${e.type}${e.essai}`);
  assert.deepEqual(c3, ['envoi1', 'saut1', 'perte1', 'timeout1', 'envoi2', 'saut2', 'saut2', 'reception2', 'complet2', 'ack2']);
  // The timeout fires exactly delaiAttente after the first send.
  const first = events.find((e) => e.numero === 3 && e.type === 'envoi');
  const timeout = events.find((e) => e.type === 'timeout');
  assert.equal(timeout.t - first.t, 200);
});

test('a delay longer than the timeout gives exactly 1 duplicate', () => {
  const { result, events } = run('avec', [{ morceau: 5, action: 'retarder', delai: 300 }]);
  assert.equal(result.complet, true);
  assert.equal(result.retransmissions, 1);
  assert.equal(result.doublons, 1);
  const dup = events.find((e) => e.type === 'doublon');
  assert.equal(dup.numero, 5);
  assert.equal(dup.essai, 1); // the late original arrives after the resent copy
  assert.ok(events.some((e) => e.type === 'ack-doublon' && e.numero === 5)); // the duplicate is re-ACKed
});

test('a short delay only changes the arrival order (no retransmission)', () => {
  const { result, events } = run('avec', [{ morceau: 5, action: 'retarder', delai: 60 }]);
  assert.equal(result.retransmissions, 0);
  assert.equal(result.complet, true);
  const order = events.filter((e) => e.type === 'reception').map((e) => e.numero);
  assert.deepEqual(order, [1, 2, 3, 4, 6, 7, 5]);
  const cells = events.at(-1).etat.recepteur;
  assert.equal(cells[4].ordre, 7); // chunk 5 arrived last
});

test('same script twice gives identical runs', () => {
  const script = [{ morceau: 3, action: 'perdre' }, { morceau: 5, action: 'retarder', delai: 60 }];
  assert.deepEqual(run('avec', script), run('avec', script));
  assert.deepEqual(run('sans', script), run('sans', script));
});

test('timers: every chunk ends confirmed, events in time order, state copied', () => {
  const { events } = run('avec', [{ morceau: 3, action: 'perdre' }]);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t);
  assert.deepEqual(events.at(-1).etat.emetteur, Array(7).fill('confirme'));
  // Snapshots are copies: the first event still shows the initial state.
  assert.deepEqual(events[0].etat.recepteur, Array(7).fill(null));
  assert.equal(events.filter((e) => e.type === 'timeout').length, 1);
});

test('recovery costs time: with a loss, completion is later than without incident', () => {
  const clean = run('avec').result.tempsTotal;
  const lossy = run('avec', [{ morceau: 3, action: 'perdre' }]).result.tempsTotal;
  assert.equal(clean, 120); // last chunk sent at 60 ms + 3 links of 20 ms
  assert.ok(lossy > clean);
  assert.equal(lossy, 20 + 200 + 60); // chunk 3 sent at 20, resent at 220, arrives 60 ms later
});

test('trajets describe every move', () => {
  const { trajets } = run('avec', [{ morceau: 3, action: 'perdre' }]);
  const lost = trajets.filter((x) => x.fin === 'perdu');
  assert.equal(lost.length, 1);
  assert.deepEqual([lost[0].de, lost[0].vers, lost[0].numero], ['RA', 'RB', 3]);
  assert.ok(trajets.every((x) => x.t1 > x.t0));
  assert.equal(trajets.filter((x) => x.kind === 'ack').length, 7);
});
