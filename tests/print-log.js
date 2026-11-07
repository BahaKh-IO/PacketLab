// Print the journey of one packet (or of a scenario) in the terminal.
// Usage: node tests/print-log.js <topology> <source> <destination>
//        node tests/print-log.js <topology> --scenario <id>
// Examples: node tests/print-log.js mixte PC-A PC-B
//           node tests/print-log.js mixte --scenario boucle
import { readFileSync } from 'node:fs';
import { simulate, simulateScenario } from '../js/engine/network.js';

const [id = 'mixte', src = 'PC-A', dst = 'PC-B'] = process.argv.slice(2);
const topo = JSON.parse(readFileSync(new URL(`../data/topologies/${id}.json`, import.meta.url), 'utf8'));

let sc = null;
if (src === '--scenario') {
  sc = (topo.scenarios ?? []).find((s) => s.id === dst);
  if (!sc) {
    console.error(`Scénario inconnu. Disponibles : ${(topo.scenarios ?? []).map((s) => s.id).join(', ')}`);
    process.exit(1);
  }
}
const events = sc ? simulateScenario(topo, sc) : simulate(topo, src, dst);

function header(f) {
  if (!f) return '';
  if (f.kind === 'arp') return `ARP ${f.arp.op}  MAC ${f.macSrc} -> ${f.macDst}`;
  return `MAC ${f.macSrc ?? '?'} -> ${f.macDst ?? '?'} | IP ${f.ipSrc} -> ${f.ipDst} | TTL ${f.ttl}`;
}

if (sc) console.log(`${topo.nom} — scénario « ${sc.nom} » — ${events.length} étapes\n${sc.description}\n`);
else console.log(`${topo.nom} — ${src} -> ${dst} — ${events.length} étapes\n`);
events.forEach((e, i) => {
  const links = e.links.length ? ` [${e.links.join(',')}]` : '';
  console.log(`${String(i + 1).padStart(3)}. t=${String(e.t).padStart(3)} ms  ${e.type.padEnd(11)} ${e.device.padEnd(5)}${links}`);
  console.log(`      ${e.note}`);
  const h = header(e.frame);
  if (h) console.log(`      ${h}`);
});
