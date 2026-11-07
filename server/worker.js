// worker.js — entry point on Cloudflare Workers. env.DB is the D1 database bound in wrangler.toml,
// env.ALLOWED_ORIGINS the site allowed to call the API (a [vars] entry in wrangler.toml).
import { handleRequest } from './api.js';

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
