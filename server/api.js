// api.js — the PacketLab backend: student accounts and their saved progress ("labs réalisés").
//
// handleRequest(request, env) takes a standard web Request and returns a Response,
// so the same code runs on Cloudflare Workers (worker.js) and in Node (dev-server.js).
// env.DB is a D1-like database: env.DB.prepare(sql).bind(...).first() / .run() / .all().
// env.ALLOWED_ORIGINS is the comma-separated list of sites allowed to call the API.
//
// Routes (JSON in and out, French error messages):
//   POST   /api/inscription   { nom, email, motDePasse }  -> 201 { jeton, utilisateur }
//   POST   /api/connexion     { email, motDePasse }       -> 200 { jeton, utilisateur }
//   POST   /api/deconnexion   (jeton)                     -> 204
//   GET    /api/moi           (jeton)                     -> 200 { utilisateur }
//   GET    /api/progression   (jeton)                     -> 200 { progression, maj }
//   PUT    /api/progression   (jeton) { progression }     -> 200 { maj }
//   DELETE /api/compte        (jeton) { motDePasse }      -> 204   (deletes the account and its data)
// "(jeton)" = header  Authorization: Bearer <jeton>

const ITERATIONS = 100000;            // PBKDF2 rounds (the maximum Cloudflare's Web Crypto accepts)
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;               // failed logins before the email is blocked…
const BLOCK_MINUTES = 15;             // …for this long
const MAX_PROGRESS_BYTES = 64 * 1024; // a progress object is a few KB; refuse anything huge
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const enc = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (s) => new Uint8Array(s.match(/../g).map((b) => parseInt(b, 16)));

/** Error carrying an HTTP status and a French message for the student. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- passwords and tokens ----------

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

/** "pbkdf2$100000$<salt>$<hash>": a new random salt for every password. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${hex(salt)}$${hex(await pbkdf2(password, salt, ITERATIONS))}`;
}

/** Compare in constant time (the time taken does not reveal how many characters match). */
export async function checkPassword(password, stored) {
  const [scheme, iterations, salt, expected] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = hex(await pbkdf2(password, fromHex(salt), Number(iterations)));
  let diff = got.length ^ expected.length;
  for (let i = 0; i < Math.min(got.length, expected.length); i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));

// ---------- helpers ----------

const now = (env) => new Date(env.now ? env.now() : Date.now());
const publicUser = (u) => ({ id: u.id, nom: u.nom, email: u.email });

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'Requête invalide : le corps doit être un objet JSON.');
  }
}

/** The logged-in student, from the Bearer token, or a 401 error. */
async function currentUser(request, env) {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new HttpError(401, 'Vous devez être connecté.');
  const row = await env.DB.prepare(
    `SELECT u.id, u.nom, u.email, u.mot_de_passe, s.expire_le, s.jeton_hash FROM sessions s
     JOIN utilisateurs u ON u.id = s.utilisateur_id WHERE s.jeton_hash = ?`).bind(await sha256(token)).first();
  if (!row || new Date(row.expire_le) <= now(env)) throw new HttpError(401, 'Session expirée : reconnectez-vous.');
  return row;
}

async function openSession(env, userId) {
  const token = newToken();
  const expires = new Date(now(env).getTime() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (jeton_hash, utilisateur_id, expire_le) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expires).run();
  return token;
}

// ---------- routes ----------

async function signUp(request, env) {
  const { nom, email, motDePasse } = await readJson(request);
  const name = String(nom ?? '').trim();
  const mail = String(email ?? '').trim().toLowerCase();
  const password = String(motDePasse ?? '');
  if (name.length < 1 || name.length > 60) throw new HttpError(400, 'Le nom doit faire entre 1 et 60 caractères.');
  if (!EMAIL.test(mail) || mail.length > 120) throw new HttpError(400, 'Adresse e-mail invalide.');
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Le mot de passe doit faire au moins 8 caractères.');
  const exists = await env.DB.prepare('SELECT id FROM utilisateurs WHERE email = ?').bind(mail).first();
  if (exists) throw new HttpError(409, 'Un compte existe déjà avec cette adresse e-mail.');
  const result = await env.DB.prepare('INSERT INTO utilisateurs (nom, email, mot_de_passe, cree_le) VALUES (?, ?, ?, ?)')
    .bind(name, mail, await hashPassword(password), now(env).toISOString()).run();
  const user = { id: Number(result.meta.last_row_id), nom: name, email: mail };
  return json(201, { jeton: await openSession(env, user.id), utilisateur: user });
}

async function logIn(request, env) {
  const { email, motDePasse } = await readJson(request);
  const mail = String(email ?? '').trim().toLowerCase();
  const failures = await env.DB.prepare('SELECT echecs, bloque_jusqu FROM tentatives WHERE email = ?').bind(mail).first();
  if (failures?.bloque_jusqu && new Date(failures.bloque_jusqu) > now(env)) {
    throw new HttpError(429, `Trop d'essais : réessayez dans ${BLOCK_MINUTES} minutes.`);
  }
  const user = await env.DB.prepare('SELECT * FROM utilisateurs WHERE email = ?').bind(mail).first();
  const ok = user ? await checkPassword(String(motDePasse ?? ''), user.mot_de_passe) : false;
  if (!ok) {
    const count = (failures?.echecs ?? 0) + 1;
    const blocked = count >= MAX_FAILURES ? new Date(now(env).getTime() + BLOCK_MINUTES * 60000).toISOString() : null;
    await env.DB.prepare(`INSERT INTO tentatives (email, echecs, bloque_jusqu) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET echecs = excluded.echecs, bloque_jusqu = excluded.bloque_jusqu`)
      .bind(mail, blocked ? 0 : count, blocked).run();
    // Same message whether the email exists or not: it does not reveal who has an account.
    throw new HttpError(401, 'E-mail ou mot de passe incorrect.');
  }
  await env.DB.prepare('DELETE FROM tentatives WHERE email = ?').bind(mail).run();
  return json(200, { jeton: await openSession(env, user.id), utilisateur: publicUser(user) });
}

async function logOut(request, env) {
  const user = await currentUser(request, env);
  await env.DB.prepare('DELETE FROM sessions WHERE jeton_hash = ?').bind(user.jeton_hash).run();
  return new Response(null, { status: 204 });
}

async function me(request, env) {
  return json(200, { utilisateur: publicUser(await currentUser(request, env)) });
}

async function getProgress(request, env) {
  const user = await currentUser(request, env);
  const row = await env.DB.prepare('SELECT donnees, maj FROM progressions WHERE utilisateur_id = ?').bind(user.id).first();
  return json(200, { progression: row ? JSON.parse(row.donnees) : null, maj: row?.maj ?? null });
}

async function putProgress(request, env) {
  const user = await currentUser(request, env);
  const { progression } = await readJson(request);
  const text = JSON.stringify(progression ?? null);
  if (!progression || progression.version !== 1 || typeof progression.quiz !== 'object') {
    throw new HttpError(400, 'Progression invalide.');
  }
  if (enc.encode(text).length > MAX_PROGRESS_BYTES) throw new HttpError(413, 'Progression trop volumineuse.');
  const maj = now(env).toISOString();
  await env.DB.prepare(`INSERT INTO progressions (utilisateur_id, donnees, maj) VALUES (?, ?, ?)
    ON CONFLICT(utilisateur_id) DO UPDATE SET donnees = excluded.donnees, maj = excluded.maj`).bind(user.id, text, maj).run();
  return json(200, { maj });
}

async function deleteAccount(request, env) {
  const user = await currentUser(request, env);
  const { motDePasse } = await readJson(request);
  if (!(await checkPassword(String(motDePasse ?? ''), user.mot_de_passe))) {
    throw new HttpError(401, 'Mot de passe incorrect.');
  }
  // Deleted explicitly (not only through ON DELETE CASCADE, which needs foreign keys switched on).
  await env.DB.prepare('DELETE FROM progressions WHERE utilisateur_id = ?').bind(user.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE utilisateur_id = ?').bind(user.id).run();
  await env.DB.prepare('DELETE FROM utilisateurs WHERE id = ?').bind(user.id).run();
  return new Response(null, { status: 204 });
}

const ROUTES = {
  'POST /api/inscription': signUp,
  'POST /api/connexion': logIn,
  'POST /api/deconnexion': logOut,
  'GET /api/moi': me,
  'GET /api/progression': getProgress,
  'PUT /api/progression': putProgress,
  'DELETE /api/compte': deleteAccount,
};

// ---------- CORS and entry point ----------

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

/** Only our own site may call the API from a browser. */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function handleRequest(request, env) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let response;
  try {
    const route = ROUTES[`${request.method} ${new URL(request.url).pathname}`];
    if (!route) throw new HttpError(404, 'Adresse inconnue.');
    response = await route(request, env);
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err); // unexpected: keep the detail in the server log only
    response = err instanceof HttpError
      ? json(err.status, { erreur: err.message })
      : json(500, { erreur: 'Erreur du serveur. Réessayez plus tard.' });
  }
  for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
  return response;
}
