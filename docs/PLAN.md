# PacketLab — Build Plan

Nov 5, 2026 · @Baha

Full scope is kept. Today's 3–4 hours build the engine for all 5 topologies and a first playable simulator page, deployed; later sessions add pedagogy, Module B, content and documentation.

## Decisions

| Topic | Decision |
| --- | --- |
| Scope | Everything from the project description: 5 topologies, speed control, keyboard shortcuts, teaching bubbles, questions during the simulation, full Module B (loss, delay, out-of-order, animated comparison) |
| Stack | Vanilla JS (ES modules), HTML, CSS; no framework, no build step |
| ARP tables | Empty at start for PCs and routers; switches' MAC tables empty too; routing tables pre-filled |
| Who builds | Baha does every build task, with Claude Code |
| Nour | Collects course material and writes or checks quiz and fiche text (not needed today) |
| Content | Claude drafts the quizzes and fiches; Nour checks them against the course |
| Tests | `node --test` on the engine, if Node.js is installed (checked in step 1) |
| Hosting | GitHub Pages, public repo `packetlab` (to be created today) |
| Sessions | Today 3–4 h; then sessions 2–5, about 3 h each, whenever you can |

## Today (3–4 h)

Work through the steps in order and commit after each one. Step 4 is the one that must be done tonight; if time runs out after it, steps 5–7 open session 2.

**Step 1 — Setup (15 min)**

- [ ] Open a terminal and type `node -v`. A version number (e.g. `v22.x`) means it is installed; “not recognized” means install the LTS from nodejs.org, then reopen the terminal
- [ ] On GitHub: new public repo `packetlab` with a README; clone it; open the folder in VS Code; install the Live Server extension
- [ ] Settings → Pages → deploy from branch `main`, folder `/`
- [ ] Copy the project description and the Objectif 1 slides into `docs/`

**Step 2 — Skeleton and CLAUDE.md (15 min)**

- [ ] Create `CLAUDE.md` (prompt 1 below), read it, fix anything wrong
- [ ] Create the structure below and 7 pages with a shared header (prompt 2); push; open the Pages link

```text
packetlab/
├─ index.html  simulateur.html  fiabilite.html  quiz.html  fiches.html  cours.html  progression.html
├─ css/style.css
├─ js/engine/   scheduler.js  network.js  reliability.js
├─ js/ui/       topology-view.js  player.js  panels.js  quiz.js  sheets.js
├─ js/storage.js
├─ data/topologies/  etoile.json  bus.json  anneau.json  maillee.json  mixte.json
├─ data/quiz/  data/fiches/  cours/
├─ tests/engine.test.js  tests/print-log.js
└─ README.md  CLAUDE.md  docs/
```

**Step 3 — Topology format, étoile and mixte (20 min)**

- [ ] Fix the JSON shape: devices (id, type, position, interfaces with ip/masque/mac, gateway for PCs, routes for routers, empty ARP and MAC tables) and links (`"PC-A:eth0"` ↔ `"SW1:p1"`)
- [ ] `etoile.json`: 4 PCs + 1 switch in 192.168.1.0/24
- [ ] `mixte.json`: the addresses of § 7.1, plus one extra PC per LAN
- [ ] Check by hand: every IP in its link's subnet, every next hop directly connected, no duplicate MAC

**Step 4 — Engine core (50 min) — must be done tonight**

- [ ] `scheduler.js`: events sorted by simulated time, ties by insertion order
- [ ] Event = `{ t, type, device, frame, note, tables }`: `note` is the French log sentence, `tables` a copy of the tables after the event (this makes “étape précédente” and “rejouer” trivial)
- [ ] PC: ARP for the destination (same subnet) or the gateway (other subnet); hold the data until the reply
- [ ] Switch: learn source MAC + port; forward to one port or flood; never change the frame
- [ ] Router: TTL − 1 (drop at 0), longest-prefix match, ARP for the next hop, rewrite both MACs, keep both IPs
- [ ] Tests: worked example (MACs per segment, TTL 64/63/62), IPs unchanged, same input = same events, étoile never uses a router
- [ ] `node tests/print-log.js mixte PC-A PC-B` prints the journey; read it once and check it against § 7.1

**Step 5 — Bus, anneau, maillée (30 min)**

- [ ] `bus.json` + rule: every station receives, only the destination MAC keeps the frame
- [ ] `anneau.json` + rule: frame passed station to station in one direction until the destination
- [ ] `maillee.json`: 4 routers, 2 LANs, several paths; static routes pick one; test that the path follows the routing tables
- [ ] One test per topology

**Step 6 — Simulator page v1 (60 min)**

- [ ] Selects: topology, source, destination; “Lancer”
- [ ] SVG drawn from the JSON (`viewBox` so it scales); active device and link in cyan; packet as a dot on the current link
- [ ] Player: précédent · suivant · lecture/pause · rejouer, step counter, speed 0.5× / 1× / 2×
- [ ] Keyboard: ← → steps, space play/pause, R rejouer
- [ ] Panels: headers (MAC, IP, TTL, changed value highlighted), table consulted, log with the current line highlighted

**Step 7 — Deploy (10 min)**

- [ ] Merge to `main`, open the Pages link on your phone, play mixte PC-A → PC-B
- [ ] If a JSON fails online only: check relative paths (`./data/...`) and exact lower-case file names

## Session 2 — Simulator pedagogy and polish (≈ 3 h)

Goal: the simulator teaches on its own, without you explaining next to it.

- [ ] Finish any step from today that is not done
- [ ] Smooth packet animation along the link (`requestAnimationFrame`), broadcast as several packets, dropped frame shown with a cross
- [ ] Teaching bubbles, shown once each, the first time it happens: switch keeps the addresses; router rewrites the MACs and keeps the IPs; TTL decreases; ARP finds the MAC
- [ ] Questions during the simulation: optional `questions` array in a topology JSON (`{ apresEtape, enonce, choix, bonne, explication }`); the player pauses and asks, e.g. “Quelle sera la MAC destination après R2 ?”
- [ ] Write those questions for mixte (3) and maillée (2)
- [ ] Click a device → its tables open in the side panel; click a log line → jump to that step
- [ ] Responsive: under 768 px the drawing on top, panels as tabs below, controls sticky, buttons ≥ 44 px
- [ ] Home page: hero, three module cards, “reprendre” from localStorage
- [ ] URL parameters (`simulateur.html?topo=mixte&src=PC-A&dst=PC-B`) so fiches and the demo open a ready scenario

## Session 3 — Labo fiabilité, full version (≈ 3 h)

Goal: the demo step of § 18 works: chunk 3 lost without recovery (hole), then with recovery (timeout, resend, complete), compared side by side.

**Engine (`reliability.js`, reuses `scheduler.js`)**

- [ ] Message split into numbered chunks (size 4 by default); path Émetteur → Routeur A → Routeur B → Récepteur
- [ ] Incident script: `[{ morceau: 3, action: "perdre" }, { morceau: 5, action: "retarder", delai: 60 }]`; a delay makes chunks arrive out of order
- [ ] Without recovery: each chunk sent once
- [ ] With recovery: ACK per chunk, one timer per chunk, resend on timeout; duplicates dropped but re-ACKed
- [ ] `RunResult`: complete, total time, transmissions, retransmissions, duplicates
- [ ] Tests: no incident → 0 retransmissions; lose 3 → exactly 1; a delay longer than the timeout → 1 duplicate; same script twice → identical results

**Page (`fiabilite.html`)**

- [ ] Message input, chunk size, click a chunk to set perdre / retarder / normal
- [ ] Network strip with chunks moving; lost chunk crossed out; retransmission in violet
- [ ] Receiver cells filling in arrival order
- [ ] “Comparer”: both modes animated side by side on the same script, then the results table
- [ ] Same controls as the simulator (step, play, speed, keyboard)
- [ ] “À propos du modèle” panel: simplifications, not TCP

## Session 4 — Quizzes, fiches, courses, progress (≈ 3 h)

Goal: Module C complete. Claude drafts all text; Nour checks it against the course before it is merged.

- [ ] Ask Claude (in this project chat) for the quiz JSON: 7 themes × 8 questions (Adressage IP, Adresses MAC, ARP, Commutation, Routage, Topologies, Fiabilité), each with 4 choices, the answer and an explanation
- [ ] Ask Claude for 8 fiches as JSON (IP et masque, MAC, ARP, Switch, Routeur, TTL, Topologies, ACK et timeout), each with a “voir dans le simulateur” link
- [ ] `quiz.js`: theme list, one question at a time, correction after each answer, final score, “revoir dans le simulateur”
- [ ] `sheets.js` + `fiches.html`: one screen per fiche
- [ ] Courses: one PDF per main theme, written from the fiches plus Nour's material, sources cited on page 1; `cours.html` with Consulter / Télécharger
- [ ] `storage.js` + `progression.html`: quiz attempts, best score per theme, simulations per topology, a small SVG bar chart, “Réinitialiser”
- [ ] Nour's check: every answer and every explanation against the course; fix before merge

## Session 5 — Documentation, testing, demo (≈ 3 h)

Goal: graded documentation done, no network error on screen, demo rehearsed on the live link.

- [ ] For each of the 5 topologies, write the expected trace by hand (like § 7.1) and compare it with the app
- [ ] Browsers: Chrome, Firefox, Edge on desktop; Chrome on Android
- [ ] Accessibility basics: real `<button>`s with labels, contrast check, `prefers-reduced-motion`
- [ ] UML: use-case diagram (draw.io); class diagram, sequence PC-A → PC-B (now with R1's and R2's ARP), Module B sequence and state diagrams (Mermaid), all matching the real code
- [ ] README: what it is, live link, screenshots, run locally, run tests, simplifications, credits
- [ ] `a-propos.html`: model and simplifications, team, credits
- [ ] Bonus if time: PWA (works offline in the exam room), shareable scenario link
- [ ] Tag `v1.0`; rehearse the 5-minute demo of § 18 twice; keep a local copy and a screen recording as plan B

## Nour — what to collect (before session 4)

Nothing here blocks today. She drops everything in `docs/reference/` and uploads the course slides to this Claude project.

- [ ] Networking course slides: IP addressing, MAC, ARP, switching, routing, topologies, reliability (ACK, timeout)
- [ ] Course vocabulary to reuse word for word in the quizzes (e.g. “trame” vs “paquet”, “commutateur” vs “switch”)
- [ ] Any exercise from the course that could become a quiz question or a simulation question
- [ ] Review of Claude's quiz and fiche drafts (session 4)
- [ ] Optional: logo source file and exact hex codes; until then the colours from the slides are used

## Claude Code prompts for today

Run Claude Code in the repo folder. For each prompt: ask for a plan first, read the diff, run the tests, commit. These 8 prompts cover steps 2–6.

1. “Read docs/. Write a CLAUDE.md of about 15 lines: what PacketLab is; plain HTML/CSS/JS with ES modules, no framework, no dependency, no build step; the engine never touches the DOM and the UI only reads the event list; UI text in French, code in English; ARP and MAC tables start empty, routing tables pre-filled; run tests with `node --test`; ask before adding a library or changing a JSON format.”
2. “Create the folder structure from the plan and the 7 pages with a shared header and navigation. No logic yet.”
3. “Propose a JSON format for topologies, then write `etoile.json` and `mixte.json` with exactly the addresses of § 7.1 in docs, plus one extra PC per LAN. Show me the format before writing the files.”
4. “Write `scheduler.js`: a queue of events sorted by simulated time, ties by insertion order. Explain the data structure first. Add a test.”
5. “Write the PC, ARP and switch rules in `network.js` and `simulate(topology, src, dst)`. Each event carries a French `note` and a copy of the tables. Add tests on étoile.”
6. “Add the router rule. Add a test that checks § 7.1: MACs per segment, IPs unchanged, TTL 64, 63, 62. Then write `tests/print-log.js`.”
7. “Add bus, anneau and maillée: JSON files, rules, one test each.”
8. “Build `simulateur.html`: SVG view, player (précédent, suivant, lecture/pause, rejouer, speed 0.5/1/2, keys ← → space R), headers, table and log panels. The UI only reads the event list.”

After prompt 6, ask “explain `network.js` to me line by line”: this is the file the jury will question most.

## Learning checklist

The project is done when you can answer every line below without notes. Tick them in session 5.

**Engine**

- [ ] What a discrete-event simulation is, and why a sorted event queue beats `setTimeout` (determinism, step back, replay)
- [ ] Why the UI only reads the event log, and what would break if it called the engine directly
- [ ] When a PC sends ARP for the destination versus for its gateway
- [ ] How the switch fills its MAC table and when it floods, and how a bus and a ring deliver a frame without a switch
- [ ] How the router picks a route (longest prefix), and which fields it rewrites versus keeps
- [ ] How ACK + timeout recovers a lost chunk, and what happens if a chunk arrives twice

**Web**

- [ ] What an ES module `import` is, and why `fetch()` of a JSON file needs a local server
- [ ] How the SVG is drawn from data, and why `viewBox` makes it responsive
- [ ] How CSS variables and one media query give the theme and the mobile layout
- [ ] What localStorage keeps, where, and why it is wrapped in try/catch

**Tools**

- [ ] Branch, commit, pull request, merge in Git
- [ ] How GitHub Pages serves the repo, and why relative paths and exact file names matter there
- [ ] How to run the tests and what each one proves
- [ ] What Claude Code wrote and what you decided, checked or fixed yourselves

## Open questions

None of these blocks today; ask them at the next class.

1. **Teacher:** is plain JavaScript accepted? Objectif 1 slide 4 announced React or Vue.js, so say it explicitly if you drop it.
2. **Teacher:** what are the dates and expected content of Objectif 2, the final delivery, and the soutenance?
3. **Teacher:** is an AI coding assistant allowed, and should its use be declared in the report?
4. **Teacher:** does “complexité technique” expect a backend (login, database)? This plan has none, on purpose.
