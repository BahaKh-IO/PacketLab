# PacketLab — data formats

Frozen at step 3. Any change to these formats must be agreed first (see CLAUDE.md).

## Topology file (`data/topologies/<id>.json`)

### Topology
- `id` — string, same as the file name without `.json` (`"etoile"`, `"bus"`, `"anneau"`, `"maillee"`, `"mixte"`).
- `nom` — string, French title shown in the select (e.g. `"Mixte : deux réseaux locaux et deux routeurs"`).
- `type` — string, one of `"etoile"`, `"bus"`, `"anneau"`, `"maillee"`, `"mixte"`; selects the bus and ring rules in the engine.
- `description` — string, one French sentence shown under the drawing.
- `devices` — array of Device.
- `links` — array of Link.
- `questions` — optional array of Question (used from session 2; ignored by the engine).
- `scenarios` — optional array of Scenario: ready-made examples of this topology (added after session 3, agreed with Baha).

### Device
- `id` — string, unique in the file, also the label on the drawing (`"PC-A"`, `"SW1"`, `"R1"`).
- `type` — string, one of `"pc"`, `"switch"`, `"router"`, `"bus"` (the shared cable of a bus topology).
- `position` — object `{ "x": number, "y": number }`, centre of the icon in SVG units (the drawing's `viewBox` is computed from all positions).
- `interfaces` — array of Interface (a switch or bus has one per port, without `ip`/`masque`/`mac`).
- `gateway` — PC only: string IPv4 of the default gateway, or `null` when the network has no router.
- `routes` — router only: array of Route, pre-filled.
- `arp` — PC and router only: array of ArpEntry, **always `[]` in the file** (learned during the run).
- `macTable` — switch only: array of MacEntry, **always `[]` in the file** (learned during the run).

### Interface
- `nom` — string, unique in the device (`"eth0"`, `"e0"`, `"p1"`).
- `ip` — string IPv4 (`"192.168.1.10"`); absent on switch and bus ports.
- `masque` — integer prefix length, 0–32 (`24` means 255.255.255.0); absent on switch and bus ports.
- `mac` — string, six upper-case hex pairs separated by `:` (`"AA:AA:AA:00:00:0A"`); absent on switch and bus ports.

### Route
- `reseau` — string IPv4 network address (`"192.168.2.0"`); `"0.0.0.0"` with `masque` 0 is a default route.
- `masque` — integer prefix length 0–32; the engine picks the matching route with the largest `masque` (longest prefix).
- `prochainSaut` — string IPv4 of the next router, or `null` when the network is directly connected (then the next hop is the destination itself).
- `interface` — string, `nom` of the router's exit interface.

### Link
- `id` — string, unique in the file (`"L1"`).
- `a` — string `"<deviceId>:<interfaceNom>"` (`"PC-A:eth0"`); in a ring (`type` `"anneau"`), frames travel from `a` to `b`.
- `b` — string `"<deviceId>:<interfaceNom>"` (`"SW1:p1"`).
- `delai` — number, propagation delay of the link in simulated milliseconds.
- `coupe` — never in the file: set to `true` by a `cable-debranche` breakdown, on the copy used for a run.

### ArpEntry (learned, never in the file)
- `ip` — string IPv4.
- `mac` — string MAC.

### MacEntry (learned, never in the file)
- `mac` — string MAC.
- `port` — string, `nom` of the switch port where that MAC was seen.

### Question (optional; `source`/`destination` added in session 2, `scenario` after session 3, agreed with Baha)
A question belongs either to a free run (`source` + `destination`) or to a scenario (`scenario`).
- `source` — string, id of the source PC of the free run this question belongs to (`"PC-A"`).
- `destination` — string, id of the destination PC of that run (`"PC-B"`); the question is asked only during that exact run.
- `scenario` — string, `id` of the Scenario this question belongs to (instead of `source`/`destination`); asked only during that scenario.
- `apresEtape` — integer, step number as shown on screen (« Étape N », 1-based): the player pauses after showing it and asks, before step N + 1.
- `enonce` — string, French question.
- `choix` — array of strings.
- `bonne` — integer, index of the right answer in `choix`.
- `explication` — string, French explanation shown after the answer.

### Scenario (optional)
- `id` — string, unique in the file (`"deuxieme-envoi"`); also used in the URL (`?topo=mixte&scenario=boucle`).
- `nom` — string, French title shown in the « Exemple » menu.
- `description` — string, French sentence(s) shown under the drawing: what to look at.
- `envois` — array of `{ "source", "destination" }` (PC ids): packets sent one after the other; each starts when the network is quiet again, and tables are kept between sends.
- `ttl` — optional integer, TTL of the packets of this scenario (default 64), e.g. 8 to keep a routing loop short.
- `pannes` — optional array of Panne, applied to a copy of the topology before the run.

### Panne (breakdown of a scenario)
- `type` — one of `"passerelle"`, `"masque"`, `"route"`, `"route-supprimee"`, `"cable-debranche"`.
- `equipement` — device id (every type except `cable-debranche`).
- `valeur` — `passerelle`: new gateway IPv4; `masque`: new prefix length.
- `interface` — `masque`: optional interface name (default: the first one); `route`: exit interface of the route.
- `reseau`, `masque` — `route` / `route-supprimee`: which route (added or replaced / removed).
- `prochainSaut` — `route`: next hop IPv4, or `null` for a directly connected network.
- `lien` — `cable-debranche`: link id; every frame put on it is lost.

## Simulation event (produced by `simulate()` / `simulateScenario()`, never stored)

- `t` — number, simulated time in milliseconds.
- `type` — string: `"start"` (source decides: destination or gateway), `"arp-request"`, `"arp-reply"`, `"arp-learn"`, `"mac-learn"`, `"send"` (PC or router puts a data frame on a link), `"forward"` (one port / next station), `"flood"` (several ports / whole bus), `"route"`, `"ignore"`, `"deliver"`, `"drop"`.
- `device` — string, id of the device that acts.
- `links` — array of link ids the frame is put on by this event (several for a flood, `[]` when the frame stops here).
- `frame` — copy of the Frame concerned, or `null`.
- `note` — string, French sentence for the log.
- `tables` — deep copy of every device's `arp`, `macTable` and `routes` after the event, keyed by device id.
- `route` — `"route"` events only: copy of the Route the router chose (longest prefix), so the UI can highlight it.

### Frame
- `kind` — `"arp"` or `"data"`.
- `macSrc`, `macDst` — strings; `macDst` is `"FF:FF:FF:FF:FF:FF"` for a broadcast.
- `arp` — ARP frames only: `{ "op": "request" | "reply", "senderIp", "senderMac", "targetIp", "targetMac" }`.
- `ipSrc`, `ipDst`, `ttl` — data frames only (`macDst` is `null` in the `start` event, before ARP).
