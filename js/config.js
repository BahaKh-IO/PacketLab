// config.js — where the backend API is.
// DEPLOYED stays empty until the Cloudflare Worker is deployed (see docs/backend.md);
// while it is empty, the site works exactly as before, without accounts.
const DEPLOYED = 'https://packetlab-api.packetlab-handoff.workers.dev'; // Cloudflare Worker (deployed Nov 8, 2026)
const LOCAL = 'http://127.0.0.1:8787'; // node server/dev-server.js

const isLocal = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
export const API_URL = isLocal ? LOCAL : DEPLOYED;
