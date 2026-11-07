// Learning content (Module C): themes, quizzes, fiches, flashcards, courses.
// Checks the structure, recomputes every answer that can be computed, refuses
// duplicates, and checks that every "voir dans le simulateur" link opens a real run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { networkOf, inSubnet, maskFromPrefix } from '../js/engine/ip.js';
import { longestPrefixMatch } from '../js/engine/network.js';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const { themes } = json('data/themes.json');
const themeIds = themes.map((t) => t.id);
const quizzes = themeIds.map((id) => json(`data/quiz/${id}.json`));
const ipText = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim();

/** A simulator or lab link must open something that exists. */
function checkLink(url, where) {
  const u = new URL(url, 'https://x/');
  if (u.pathname === '/fiabilite.html') return;
  assert.equal(u.pathname, '/simulateur.html', `${where}: link to a known page`);
  const topoId = u.searchParams.get('topo');
  assert.ok(existsSync(new URL(`data/topologies/${topoId}.json`, root)), `${where}: topology ${topoId}`);
  const topo = json(`data/topologies/${topoId}.json`);
  const sc = u.searchParams.get('scenario');
  if (sc) {
    assert.ok((topo.scenarios ?? []).some((s) => s.id === sc), `${where}: scenario ${topoId}/${sc}`);
  } else {
    const pcs = topo.devices.filter((d) => d.type === 'pc').map((d) => d.id);
    assert.ok(pcs.includes(u.searchParams.get('src')) && pcs.includes(u.searchParams.get('dst')), `${where}: src/dst of ${url}`);
  }
}

test('themes: 7 unique themes, each with a title, a summary and a valid simulator link', () => {
  assert.equal(themes.length, 7);
  assert.equal(new Set(themeIds).size, themeIds.length);
  for (const t of themes) {
    assert.ok(t.titre && t.resume.length > 20, t.id);
    checkLink(t.simulateur, `theme ${t.id}`);
  }
});

test('quizzes: one per theme, at least 8 well-formed questions each', () => {
  quizzes.forEach((quiz, k) => {
    assert.equal(quiz.theme, themeIds[k]);
    assert.ok(quiz.questions.length >= 8, `${quiz.theme}: at least 8 questions`);
    for (const q of quiz.questions) {
      assert.ok(q.enonce.length > 15 && q.explication.length > 40, `${q.id}: text`);
      assert.equal(q.choix.length, 4, `${q.id}: 4 choices`);
      assert.equal(new Set(q.choix.map(norm)).size, 4, `${q.id}: distinct choices`);
      assert.ok(Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < 4, `${q.id}: answer index`);
      if (q.simulateur) checkLink(q.simulateur, q.id);
    }
  });
});

test('no duplicates: question ids and question texts are unique across all quizzes', () => {
  const all = quizzes.flatMap((q) => q.questions);
  assert.equal(new Set(all.map((q) => q.id)).size, all.length, 'unique ids');
  const texts = all.map((q) => norm(q.enonce));
  assert.equal(new Set(texts).size, texts.length, 'unique question texts');
});

test('computed answers: every question with a "calcul" has the right answer', () => {
  const all = quizzes.flatMap((q) => q.questions).filter((q) => q.calcul);
  assert.ok(all.length >= 8, 'several computed questions');
  for (const q of all) {
    const c = q.calcul;
    const right = q.choix[q.bonne];
    let expected;
    if (c.type === 'reseau') expected = ipText(networkOf(c.ip, c.masque));
    else if (c.type === 'diffusion') expected = ipText((networkOf(c.ip, c.masque) | (~maskFromPrefix(c.masque) >>> 0)) >>> 0);
    else if (c.type === 'hotes') expected = String(2 ** (32 - c.masque) - 2);
    else if (c.type === 'masque') expected = ipText(maskFromPrefix(c.masque));
    else if (c.type === 'maillage') expected = String((c.n * (c.n - 1)) / 2);
    else if (c.type === 'route') {
      const routes = c.routes.map(([reseau, masque, label]) => ({ reseau, masque, label }));
      expected = longestPrefixMatch(routes, c.ip).label;
    } else if (c.type === 'meme-reseau') {
      // Exactly one choice is in the same network as c.ip, and it is the right one.
      const same = q.choix.filter((ip) => inSubnet(ip, c.ip, c.masque));
      assert.deepEqual(same, [right], `${q.id}: only the right choice is in ${c.ip}/${c.masque}`);
      continue;
    } else assert.fail(`${q.id}: unknown calcul ${c.type}`);
    assert.equal(right, expected, `${q.id}: computed answer`);
    if (c.type !== 'route') {
      for (const other of q.choix) if (other !== right) assert.notEqual(other, expected, `${q.id}: only one right choice`);
    }
  }
});
