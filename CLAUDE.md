# PacketLab — notes for Claude Code

PacketLab is an educational web app (Sup'Com web project, Mme Nesrine Zaghdoud, team Baha Eddine Khantouch + Nour El Houda Fodha).
A student picks a prepared network topology, sends a packet, and follows it step by step, seeing MAC/IP headers and the ARP, MAC and routing tables at each hop. Module B shows loss, delay and ACK/retransmission. Module C has quizzes, fiches and PDF courses.

Read first: `docs/PLAN.md` (build plan, decisions, today's steps) and `docs/PacketLab_Description_Detaillee.md` (full spec; § 7.1 worked example, § 10.3 engine rules, § 11 data model, § 18 demo).

## Stack rules
- Plain HTML, CSS, JavaScript with ES modules. No framework, no npm runtime dependency, no build step.
- Hosted on GitHub Pages: all paths relative (`./data/...`), file names lower-case.
- Local dev with VS Code Live Server (fetch of JSON fails from file://).
- Ask before adding any library or changing a JSON format.

## Architecture rules
- `js/engine/` never touches the DOM. `simulate(topology, src, dst)` returns the full, ordered event list.
- The UI only reads that event list; it never calls the device rules.
- Event = `{ t, type, device, frame, note, tables }`; `note` is a French sentence for the log; `tables` is a copy of the tables after the event.
- Event queue sorted by simulated time, ties by insertion order: same input always gives the same events.
- Deep-copy the topology before a run.

## Network rules (never break these)
- ARP tables (PCs, routers) and switch MAC tables start EMPTY; routing tables are pre-filled in the JSON.
- PC: destination in its subnet -> ARP for destination IP, else ARP for its gateway; hold data until the reply.
- Switch: learn source MAC + port; known destination -> one port; unknown/broadcast -> all other ports; never modifies the frame.
- Router: TTL - 1 (drop at 0); longest-prefix match; ARP for next hop if unknown; rewrite MAC src (exit interface) and MAC dst (next hop); IP src/dst unchanged; no NAT.
- Bus: every station receives, only the destination MAC keeps it. Ring: station to station in one direction.

## Worked example (mixte) — must pass as a test
PC-A 192.168.1.10/24 gw .1 AA:AA:AA:00:00:0A | R1 e0 192.168.1.1/24 11:11:11:00:00:01, e1 10.0.0.1/30 11:11:11:00:00:02 | R2 e0 10.0.0.2/30 22:22:22:00:00:01, e1 192.168.2.1/24 22:22:22:00:00:02 | PC-B 192.168.2.20/24 BB:BB:BB:00:00:0B
Segments: PC-A->R1 MAC AA..0A -> 11..01, TTL 64 | R1->R2 MAC 11..02 -> 22..01, TTL 63 | R2->PC-B MAC 22..02 -> BB..0B, TTL 62. IPs 192.168.1.10 -> 192.168.2.20 throughout.

## Conventions
- UI text in French; code identifiers in English.
- Tests: `node --test` (finds every `tests/*.test.js`; on Node 22 `node --test tests/` fails because a folder is not expanded). Print a run: `node tests/print-log.js mixte PC-A PC-B`.
- The developer is learning: before writing a non-trivial file, explain the approach briefly; after, be ready to explain it line by line.
