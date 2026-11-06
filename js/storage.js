// storage.js — small wrapper around localStorage.
// Every access is in try/catch: localStorage can be missing or blocked
// (private window, blocked site data); the site must still work without it.

const PREFIX = 'packetlab.';

/** Read a JSON value, or `fallback` if absent or unreadable. */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Save a JSON value; silently does nothing if storage is unavailable. */
export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage unavailable: ignore
  }
}

/** Remove a value. */
export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // storage unavailable: ignore
  }
}
