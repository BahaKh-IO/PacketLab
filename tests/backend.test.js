// Backend (server/api.js) against an in-memory node:sqlite database shaped like D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, checkPassword } from '../server/api.js';
import { openDatabase } from '../server/d1-sqlite.js';

const SITE = 'https://bahakh-io.github.io';

/** A fresh backend with its own database and a clock the test can move. */
function backend() {
  let clock = Date.parse('2026-11-07T10:00:00Z');
  const env = { DB: openDatabase(':memory:'), ALLOWED_ORIGINS: SITE, now: () => clock };
  async function call(method, path, { body, token, origin = SITE } = {}) {
    const headers = { Origin: origin };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await handleRequest(new Request(`https://api.test${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    const text = await res.text();
    return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null };
  }
  return { env, call, advance: (ms) => { clock += ms; } };
}

const ALICE = { nom: 'Alice', email: 'alice@exemple.tn', motDePasse: 'motdepasse-solide' };
const PROGRESS = { version: 1, maj: null, quiz: { arp: { tentatives: 1, meilleur: 7, total: 8, dernier: 7, date: null } }, simulations: {}, labo: {}, cartes: {} };

test('sign up, then log in, then /api/moi', async () => {
  const { call } = backend();
  const up = await call('POST', '/api/inscription', { body: ALICE });
  assert.equal(up.status, 201);
  assert.deepEqual(up.data.utilisateur, { id: 1, nom: 'Alice', email: 'alice@exemple.tn' });
  assert.match(up.data.jeton, /^[0-9a-f]{64}$/);
  const login = await call('POST', '/api/connexion', { body: { email: 'ALICE@exemple.tn', motDePasse: ALICE.motDePasse } });
  assert.equal(login.status, 200, 'email is not case-sensitive');
  const me = await call('GET', '/api/moi', { token: login.data.jeton });
  assert.equal(me.data.utilisateur.email, 'alice@exemple.tn');
});

test('sign up is validated, and one account per email', async () => {
  const { call } = backend();
  assert.equal((await call('POST', '/api/inscription', { body: { ...ALICE, email: 'pas-un-email' } })).status, 400);
  assert.equal((await call('POST', '/api/inscription', { body: { ...ALICE, motDePasse: 'court' } })).status, 400);
  assert.equal((await call('POST', '/api/inscription', { body: { ...ALICE, nom: '  ' } })).status, 400);
  assert.equal((await call('POST', '/api/inscription', { body: ALICE })).status, 201);
  const again = await call('POST', '/api/inscription', { body: { ...ALICE, email: 'Alice@Exemple.tn' } });
  assert.equal(again.status, 409);
  assert.match(again.data.erreur, /existe déjà/);
});

test('passwords and session tokens are never stored in clear', async () => {
  const { call, env } = backend();
  const { data } = await call('POST', '/api/inscription', { body: ALICE });
  const user = await env.DB.prepare('SELECT mot_de_passe FROM utilisateurs').first();
  assert.ok(!user.mot_de_passe.includes(ALICE.motDePasse));
  assert.match(user.mot_de_passe, /^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.ok(await checkPassword(ALICE.motDePasse, user.mot_de_passe));
  assert.ok(!(await checkPassword('autre chose', user.mot_de_passe)));
  const session = await env.DB.prepare('SELECT jeton_hash FROM sessions').first();
  assert.notEqual(session.jeton_hash, data.jeton, 'only the hash of the token is stored');
});

test('wrong password and unknown email get the same answer', async () => {
  const { call } = backend();
  await call('POST', '/api/inscription', { body: ALICE });
  const wrong = await call('POST', '/api/connexion', { body: { email: ALICE.email, motDePasse: 'mauvais-mot' } });
  const unknown = await call('POST', '/api/connexion', { body: { email: 'bob@exemple.tn', motDePasse: 'mauvais-mot' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.data, unknown.data);
});

test('5 failed logins block the email for 15 minutes', async () => {
  const { call, advance } = backend();
  await call('POST', '/api/inscription', { body: ALICE });
  for (let i = 0; i < 5; i++) await call('POST', '/api/connexion', { body: { email: ALICE.email, motDePasse: 'mauvais-mot' } });
  const blocked = await call('POST', '/api/connexion', { body: { email: ALICE.email, motDePasse: ALICE.motDePasse } });
  assert.equal(blocked.status, 429, 'even the right password is refused while blocked');
  advance(16 * 60000);
  assert.equal((await call('POST', '/api/connexion', { body: { email: ALICE.email, motDePasse: ALICE.motDePasse } })).status, 200);
});

test('protected routes need a valid, unexpired token; logout ends the session', async () => {
  const { call, advance } = backend();
  const { data } = await call('POST', '/api/inscription', { body: ALICE });
  assert.equal((await call('GET', '/api/moi')).status, 401);
  assert.equal((await call('GET', '/api/moi', { token: 'f'.repeat(64) })).status, 401);
  assert.equal((await call('POST', '/api/deconnexion', { token: data.jeton })).status, 204);
  assert.equal((await call('GET', '/api/moi', { token: data.jeton })).status, 401, 'token unusable after logout');
  const second = await call('POST', '/api/connexion', { body: { email: ALICE.email, motDePasse: ALICE.motDePasse } });
  advance(31 * 86400000);
  assert.equal((await call('GET', '/api/moi', { token: second.data.jeton })).status, 401, 'expired after 30 days');
});

test('progress ("labs réalisés"): saved, read back, validated, private to each student', async () => {
  const { call } = backend();
  const alice = (await call('POST', '/api/inscription', { body: ALICE })).data.jeton;
  const bob = (await call('POST', '/api/inscription', { body: { nom: 'Bob', email: 'bob@exemple.tn', motDePasse: 'un-autre-mot' } })).data.jeton;
  assert.deepEqual((await call('GET', '/api/progression', { token: alice })).data, { progression: null, maj: null });
  const put = await call('PUT', '/api/progression', { token: alice, body: { progression: PROGRESS } });
  assert.equal(put.status, 200);
  assert.deepEqual((await call('GET', '/api/progression', { token: alice })).data.progression, PROGRESS);
  assert.equal((await call('GET', '/api/progression', { token: bob })).data.progression, null, 'Bob cannot see Alice');
  assert.equal((await call('PUT', '/api/progression', { token: alice, body: { progression: { version: 2 } } })).status, 400);
  const huge = { ...PROGRESS, cartes: { x: Array(20000).fill('carte-tres-longue') } };
  assert.equal((await call('PUT', '/api/progression', { token: alice, body: { progression: huge } })).status, 413);
  assert.equal((await call('PUT', '/api/progression', { body: { progression: PROGRESS } })).status, 401);
});

test('deleting the account needs the password and erases everything', async () => {
  const { call, env } = backend();
  const token = (await call('POST', '/api/inscription', { body: ALICE })).data.jeton;
  await call('PUT', '/api/progression', { token, body: { progression: PROGRESS } });
  assert.equal((await call('DELETE', '/api/compte', { token, body: { motDePasse: 'mauvais-mot' } })).status, 401);
  assert.equal((await call('DELETE', '/api/compte', { token, body: { motDePasse: ALICE.motDePasse } })).status, 204);
  for (const table of ['utilisateurs', 'sessions', 'progressions']) {
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0, `${table} emptied`);
  }
  assert.equal((await call('POST', '/api/connexion', { body: { email: ALICE.email, motDePasse: ALICE.motDePasse } })).status, 401);
});

test('CORS: only our site may call the API from a browser', async () => {
  const { call } = backend();
  const ours = await call('OPTIONS', '/api/connexion');
  assert.equal(ours.status, 204);
  assert.equal(ours.headers.get('Access-Control-Allow-Origin'), SITE);
  const other = await call('POST', '/api/connexion', { body: { email: 'x@y.z', motDePasse: 'xxxxxxxx' }, origin: 'https://site-pirate.example' });
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await call('GET', '/api/nimporte-quoi')).status, 404);
  assert.equal((await call('POST', '/api/connexion', { body: undefined })).status, 400);
});
