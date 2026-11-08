# PacketLab — backend (comptes étudiants)

Asked by the teacher: « un backend simple qui gère les comptes des étudiants (authentification des comptes, les labs réalisés…) ».
Choices made with Baha (Nov 7, 2026): **email + password, students only**, hosted on **Cloudflare Workers + D1**. Nobody's own PC is the server.

## What it does

- Student accounts: sign up (name, email, password), log in, log out, delete the account.
- « Labs réalisés »: the progress object of `js/progress.js` (quizzes, simulations, lab runs, flashcards) is saved on the account and **merged** with the progress of each device the student uses (`mergeProgress`: counters take the maximum, flashcards the union; nothing is overwritten).
- The site keeps working **without** an account, and without the server (exam room without internet): progress then stays in the browser.

## How it is built

```
Browser (GitHub Pages)                         Cloudflare
  js/account.js  ── HTTPS + JSON ──────────►   server/worker.js
  (session token in localStorage)                └─ server/api.js  (all the logic)
                                                       └─ D1 database (server/schema.sql)
Developer machine only:
  node server/dev-server.js  ──► server/api.js ──► node:sqlite (server/dev.db, ignored by Git)
```

- `server/api.js` uses only web standards (`Request`, `Response`, Web Crypto), so the **same file** runs on Cloudflare and in Node 22. No npm package.
- `server/d1-sqlite.js` makes Node's built-in SQLite look like D1, for local development and for the tests.
- Tests: `tests/backend.test.js` (accounts, sessions, blocking, progress, deletion, CORS) and `tests/progress.test.js` (merge). Run `node --test`.

## Routes

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/api/inscription` | `{ nom, email, motDePasse }` | 201 `{ jeton, utilisateur }` |
| POST | `/api/connexion` | `{ email, motDePasse }` | 200 `{ jeton, utilisateur }` |
| POST | `/api/deconnexion` | — | 204 |
| GET | `/api/moi` | — | 200 `{ utilisateur }` |
| GET | `/api/progression` | — | 200 `{ progression, maj }` |
| PUT | `/api/progression` | `{ progression }` | 200 `{ maj }` |
| DELETE | `/api/compte` | `{ motDePasse }` | 204 |

Protected routes need the header `Authorization: Bearer <jeton>`. Errors are `{ "erreur": "<message en français>" }`.

## Security choices (to explain to the jury)

- **Passwords are never stored**: PBKDF2-SHA-256, 100 000 rounds, a random 16-byte salt per password; comparison in constant time.
- **Sessions**: a random 32-byte token given to the browser; the database keeps only its SHA-256 hash; it expires after 30 days; logout deletes it.
- **Guessing**: 5 failed logins on an email block it for 15 minutes; the same message for "unknown email" and "wrong password", so the API does not reveal who has an account.
- **CORS**: only `https://bahakh-io.github.io` (and Live Server locally) may call the API from a browser.
- **Validation**: lengths checked, progress must be a version-1 object under 64 KB.
- **Privacy**: stored = name, email, hashed password, progress. Nothing else. A student can delete the account and all its data (`DELETE /api/compte`). The account page says so.

## Run it locally

1. `node server/dev-server.js` → API on `http://127.0.0.1:8787` (this computer only).
2. Open the site with Live Server (`http://127.0.0.1:5500/...`): `js/config.js` uses the local API automatically when the page is on `localhost` / `127.0.0.1`.
3. « Mon compte » → create an account. The data goes to `server/dev.db` (local, ignored by Git).

## Current deployment (Nov 8, 2026)

- API: `https://packetlab-api.packetlab-handoff.workers.dev` (set in `js/config.js`).
- D1 database `packetlab`, region WEUR, id in `wrangler.toml`; tables created from `server/schema.sql`.
- workers.dev subdomain `packetlab-handoff`: registered automatically by wrangler (from the folder name). It can be changed in the Cloudflare dashboard (Workers & Pages → subdomain); if it is, update `DEPLOYED` in `js/config.js`.
- Checked live: sign-up (password hashing fits the free plan, about 0.6 s), login, wrong password, progress PUT/GET, account deletion, CORS (our site allowed, others refused). Test account deleted afterwards.
- Update after a change in `server/`: `npx wrangler deploy`. Change of `server/schema.sql`: run it again with `npx wrangler d1 execute packetlab --remote --file server/schema.sql`.

## Deploy on Cloudflare (Baha, with his own account)

Deployment uses Cloudflare's command-line tool **wrangler**, run with `npx` (a development tool, nothing is added to the site). Free plan; check Cloudflare's current limits.

1. Create a free account on cloudflare.com.
2. `npx wrangler login` (opens the browser to authorise).
3. `npx wrangler d1 create packetlab` → copy the printed `database_id` into `wrangler.toml`.
4. `npx wrangler d1 execute packetlab --remote --file server/schema.sql` (creates the tables).
5. `npx wrangler deploy` → prints the API address, e.g. `https://packetlab-api.<compte>.workers.dev`.
6. Put that address in `js/config.js` (`DEPLOYED`), commit and push: the « Mon compte » page switches on.
7. Test: create an account on the live site, do a quiz, open the site on the phone, log in: the quiz is there.

If logins fail on the free plan with a "CPU time limit" error, the 100 000 PBKDF2 rounds are too heavy for it: lower `ITERATIONS` in `server/api.js` (existing passwords keep working, each hash stores its own number of rounds) and tell the jury why.
