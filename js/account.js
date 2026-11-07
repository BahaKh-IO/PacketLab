// account.js — student account on the site side: calls the backend API, keeps the
// session in this browser, and keeps the progress ("labs réalisés") in sync.
//
// Sync rule: the local progress and the account's progress are MERGED (mergeProgress),
// never overwritten; the merged result is saved here and sent to the server.

import { API_URL } from './config.js';
import { load, save, remove } from './storage.js';
import { getProgress, replaceProgress, mergeProgress, onProgressChange } from './progress.js';

const SESSION = 'session';
const LAST_SYNC = 'derniere-synchro';

export const accountsEnabled = () => Boolean(API_URL);
export const currentSession = () => load(SESSION, null); // { jeton, utilisateur } or null
export const lastSync = () => load(LAST_SYNC, null);

async function api(method, path, { body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const s = currentSession();
  if (auth && s) headers.Authorization = `Bearer ${s.jeton}`;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Serveur injoignable. Vérifiez votre connexion, ou réessayez plus tard.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && auth) remove(SESSION); // expired or revoked session
  if (!res.ok) throw new Error(data?.erreur ?? `Erreur ${res.status}`);
  return data;
}

export async function signUp(nom, email, motDePasse) {
  const data = await api('POST', '/api/inscription', { body: { nom, email, motDePasse }, auth: false });
  save(SESSION, data);
  await syncNow();
  return data.utilisateur;
}

export async function logIn(email, motDePasse) {
  const data = await api('POST', '/api/connexion', { body: { email, motDePasse }, auth: false });
  save(SESSION, data);
  await syncNow();
  return data.utilisateur;
}

export async function logOut() {
  try {
    await api('POST', '/api/deconnexion');
  } finally {
    remove(SESSION);
    remove(LAST_SYNC);
  }
}

export async function deleteAccount(motDePasse) {
  await api('DELETE', '/api/compte', { body: { motDePasse } });
  remove(SESSION);
  remove(LAST_SYNC);
}

/** Merge the account's progress with this browser's, keep it here, send it back. */
export async function syncNow() {
  if (!accountsEnabled() || !currentSession()) return null;
  const remote = await api('GET', '/api/progression');
  const merged = mergeProgress(getProgress(), remote.progression);
  replaceProgress(merged);
  await api('PUT', '/api/progression', { body: { progression: merged } });
  save(LAST_SYNC, new Date().toISOString());
  return merged;
}

/** After « Réinitialiser » on the progression page: erase the account's copy too. */
export async function pushReset(empty) {
  if (!accountsEnabled() || !currentSession()) return;
  await api('PUT', '/api/progression', { body: { progression: empty } });
  save(LAST_SYNC, new Date().toISOString());
}

let timer = null;
let started = false;

/**
 * Call once per page: if a student is logged in, sync now, then send every change
 * (a quiz finished, a simulation launched…) a moment later. Never blocks the page.
 */
export function startSync() {
  if (started || !accountsEnabled()) return;
  started = true;
  if (currentSession()) syncNow().catch(() => {});
  onProgressChange(() => {
    if (!currentSession()) return;
    clearTimeout(timer);
    // Merge rather than overwrite: another device may have saved progress meanwhile.
    timer = setTimeout(() => syncNow().catch(() => {}), 1500); // offline: the next sync will catch up
  });
}
