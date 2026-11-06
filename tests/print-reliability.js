// Print a Module B run in the terminal.
// Usage: node tests/print-reliability.js <sans|avec> [perdre:N] [retarder:N:ms] ...
// Example: node tests/print-reliability.js avec perdre:3
import { simulateReliability } from '../js/engine/reliability.js';

const [mode = 'avec', ...args] = process.argv.slice(2);
const incidents = args.map((a) => {
  const [action, n, d] = a.split(':');
  return action === 'retarder' ? { morceau: Number(n), action, delai: Number(d ?? 60) } : { morceau: Number(n), action };
});
const message = "Rendez-vous à SUP'COM à 10h";
const { events, result } = simulateReliability({ message, mode, incidents });

console.log(`Mode ${mode} — incidents ${JSON.stringify(incidents)} — ${events.length} événements\n`);
for (const e of events) console.log(`t=${String(e.t).padStart(4)} ms  ${e.type.padEnd(11)} ${e.note}`);
console.log('\nRésultat :', result);
