// bubbles.js — the four teaching points of § 7.1, shown once each (per browser),
// the first time the situation happens. Each rule only reads an event.

import { load, save } from '../storage.js';

const KEY = 'bulles-vues';

export const BUBBLES = [
  {
    id: 'switch',
    when: (e, type) => type === 'switch' && (e.type === 'forward' || e.type === 'flood'),
    titre: 'Un switch ne modifie pas les adresses',
    texte: "Le switch lit seulement la MAC destination pour choisir le port de sortie. Comparez les en-têtes : MAC et IP sont exactement les mêmes avant et après lui.",
  },
  {
    id: 'arp',
    when: (e) => e.type === 'arp-learn',
    titre: 'ARP a trouvé la MAC',
    texte: "Pour envoyer une trame sur le réseau local, il faut la MAC du prochain équipement. ARP la demande à tout le réseau (« Qui a cette IP ? ») ; seul le propriétaire répond, et la réponse est gardée dans la table ARP.",
  },
  {
    id: 'ttl',
    when: (e) => e.type === 'route',
    titre: 'Le TTL diminue de 1 à chaque routeur',
    texte: "Chaque routeur enlève 1 au TTL. S'il arrive à 0, le paquet est détruit : c'est ce qui empêche un paquet de tourner en boucle pour toujours.",
  },
  {
    id: 'router',
    when: (e, type) => type === 'router' && e.type === 'send',
    titre: 'Le routeur réécrit les MAC, pas les IP',
    texte: "La MAC source devient celle de l'interface de sortie du routeur, la MAC destination celle du prochain saut. Les adresses IP, elles, ne changent jamais de bout en bout (sans NAT).",
  },
];

/** Bubbles not seen yet whose situation happens at this event. */
export function bubblesFor(event, deviceType) {
  const seen = new Set(load(KEY, []));
  return BUBBLES.filter((b) => !seen.has(b.id) && b.when(event, deviceType));
}

export function markSeen(id) {
  const seen = new Set(load(KEY, []));
  seen.add(id);
  save(KEY, [...seen]);
}

export function resetSeen() {
  save(KEY, []);
}
