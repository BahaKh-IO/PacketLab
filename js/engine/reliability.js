// reliability.js — Module B (Labo fiabilité): loss, delay, ACK and retransmission. No DOM.
//
// A message is cut into numbered chunks that travel
//   Émetteur (E) -> Routeur A (RA) -> Routeur B (RB) -> Récepteur (R).
// An incident script can lose a chunk (it disappears at RB) or delay it (held at RA).
// Two modes:
//   'sans' — each chunk is sent once, nothing is recovered;
//   'avec' — the receiver ACKs every chunk, the sender keeps one timer per chunk
//            and sends the chunk again when its timer expires without ACK.
//
// simulateReliability(...) returns
//   { morceaux, events, trajets, result }
// events  — ordered list { t, type, numero, essai, lieu, note, etat } (etat = copy of the state after the event)
// trajets — every move of a chunk or an ACK { id, kind, numero, essai, de, vers, t0, t1, fin }
//           so the page can draw where everything is at any time
// result  — RunResult { mode, complet, tempsTotal, transmissions, retransmissions, doublons, messageRecu }

import { Scheduler } from './scheduler.js';

export const DEFAULTS = {
  taille: 4,          // characters per chunk
  delaiLien: 20,      // ms per link (3 links on the path)
  intervalle: 10,     // ms between two first sends
  delaiAttente: 200,  // ms: timeout of a chunk (round trip without incident = 120 ms)
};

export const LIEUX = { E: "l'émetteur", RA: 'le routeur A', RB: 'le routeur B', R: 'le récepteur' };

/** "Rendez-vous" with size 4 -> ["Rend", "ez-v", "ous"] numbered from 1. */
export function decouper(message, taille = DEFAULTS.taille) {
  const chars = [...message]; // keeps accented letters whole
  const out = [];
  for (let i = 0; i < chars.length; i += taille) {
    out.push({ numero: out.length + 1, texte: chars.slice(i, i + taille).join('') });
  }
  return out;
}

const nth = (n) => (n === 1 ? '1er envoi' : `${n}e envoi`);

export function simulateReliability({
  message,
  taille = DEFAULTS.taille,
  incidents = [],
  mode = 'avec',
  delaiLien = DEFAULTS.delaiLien,
  intervalle = DEFAULTS.intervalle,
  delaiAttente = DEFAULTS.delaiAttente,
} = {}) {
  if (mode !== 'avec' && mode !== 'sans') throw new Error(`Unknown mode ${mode}`);
  const morceaux = decouper(message, taille);
  const n = morceaux.length;
  const script = new Map(incidents.map((x) => [x.morceau, x])); // incidents touch the first send only

  const sched = new Scheduler();
  const events = [];
  const trajets = [];
  let nextId = 1;

  // State, copied into every event.
  const emetteur = morceaux.map(() => 'attente');       // attente | envoye | expire | confirme (§ 12.5)
  const recepteur = morceaux.map(() => null);           // null or { texte, ordre }
  const pertes = [];                                    // { numero, essai }
  const compteurs = { transmissions: 0, retransmissions: 0, doublons: 0 };
  const essais = morceaux.map(() => 0);                 // number of sends of each chunk
  const timerToken = morceaux.map(() => 0);             // only the timer with the current token may fire
  let arrives = 0;
  let tempsComplet = null;

  function log(type, numero, essai, lieu, note) {
    events.push({
      t: sched.now,
      type,
      numero,
      essai,
      lieu,
      note,
      etat: structuredClone({ emetteur, recepteur, pertes, compteurs }),
    });
  }

  /** Record one move; the drawing interpolates between t0 and t1. */
  function trajet(kind, numero, essai, de, vers, t0, t1, fin = null) {
    const tr = { id: `${kind}${nextId++}`, kind, numero, essai, de, vers, t0, t1, fin };
    trajets.push(tr);
    return tr.id;
  }

  // ---------- sender ----------

  function envoyer(numero) {
    const i = numero - 1;
    essais[i] += 1;
    const essai = essais[i];
    compteurs.transmissions += 1;
    if (essai > 1) compteurs.retransmissions += 1;
    emetteur[i] = 'envoye';
    trajet('morceau', numero, essai, 'E', 'RA', sched.now, sched.now + delaiLien);
    log('envoi', numero, essai, 'E', essai === 1
      ? `L'émetteur envoie le morceau ${numero} « ${morceaux[i].texte} » (${nth(essai)}).`
      : `L'émetteur renvoie le morceau ${numero} « ${morceaux[i].texte} » (${nth(essai)}), en violet sur le schéma.`);
    sched.after(delaiLien, () => auRouteurA(numero, essai));
    if (mode === 'avec') {
      const token = ++timerToken[i];
      sched.after(delaiAttente, () => expiration(numero, token));
    }
  }

  function expiration(numero, token) {
    const i = numero - 1;
    if (timerToken[i] !== token || emetteur[i] === 'confirme') return; // cancelled by an ACK
    emetteur[i] = 'expire';
    log('timeout', numero, essais[i], 'E',
      `Pas d'ACK pour le morceau ${numero} après ${delaiAttente} ms : le délai d'attente a expiré.`);
    envoyer(numero);
  }

  function ackRecu(numero) {
    const i = numero - 1;
    if (emetteur[i] === 'confirme') {
      log('ack-doublon', numero, essais[i], 'E',
        `L'émetteur reçoit encore un ACK ${numero} : le morceau est déjà confirmé, il l'ignore.`);
      return;
    }
    emetteur[i] = 'confirme';
    timerToken[i] += 1; // cancels the running timer
    log('ack', numero, essais[i], 'E', `L'émetteur reçoit l'ACK ${numero} : le morceau ${numero} est confirmé, son délai d'attente est annulé.`);
  }

  // ---------- routers ----------

  function auRouteurA(numero, essai) {
    const incident = essai === 1 ? script.get(numero) : null;
    if (incident?.action === 'retarder') {
      const d = incident.delai;
      trajet('morceau', numero, essai, 'RA', 'RA', sched.now, sched.now + d, 'retenu');
      log('retard', numero, essai, 'RA',
        `Le routeur A retient le morceau ${numero} pendant ${d} ms (retard prévu dans le script) ; les morceaux suivants peuvent le doubler.`);
      sched.after(d, () => versRouteurB(numero, essai));
      return;
    }
    log('saut', numero, essai, 'RA', `Le morceau ${numero} passe par le routeur A.`);
    versRouteurB(numero, essai);
  }

  function versRouteurB(numero, essai) {
    const perdu = essai === 1 && script.get(numero)?.action === 'perdre';
    trajet('morceau', numero, essai, 'RA', 'RB', sched.now, sched.now + delaiLien, perdu ? 'perdu' : null);
    sched.after(delaiLien, () => auRouteurB(numero, essai, perdu));
  }

  function auRouteurB(numero, essai, perdu) {
    if (perdu) {
      pertes.push({ numero, essai });
      log('perte', numero, essai, 'RB', `Le morceau ${numero} est perdu au routeur B : il n'ira pas plus loin.`);
      return;
    }
    log('saut', numero, essai, 'RB', `Le morceau ${numero} passe par le routeur B.`);
    trajet('morceau', numero, essai, 'RB', 'R', sched.now, sched.now + delaiLien);
    sched.after(delaiLien, () => auRecepteur(numero, essai));
  }

  // ---------- receiver ----------

  function auRecepteur(numero, essai) {
    const i = numero - 1;
    const ack = mode === 'avec';
    if (recepteur[i]) {
      compteurs.doublons += 1;
      log('doublon', numero, essai, 'R',
        `Le récepteur a déjà le morceau ${numero} : il jette ce doublon, mais renvoie l'ACK ${numero} au cas où le premier se serait perdu.`);
    } else {
      arrives += 1;
      recepteur[i] = { texte: morceaux[i].texte, ordre: arrives };
      const desordre = recepteur.slice(i + 1).some(Boolean) ? ' (il arrive après un morceau suivant : désordre)' : '';
      log('reception', numero, essai, 'R',
        `Le récepteur range le morceau ${numero} « ${morceaux[i].texte} » dans la case ${numero}${desordre}` +
        (ack ? ` et envoie l'ACK ${numero}.` : '.'));
      if (arrives === n) {
        tempsComplet = sched.now;
        log('complet', numero, essai, 'R', 'Toutes les cases sont remplies : le message est reconstruit !');
      }
    }
    if (ack) {
      // ACKs are never lost in this model; they go straight back along the path.
      trajet('ack', numero, essai, 'R', 'E', sched.now, sched.now + 3 * delaiLien);
      sched.after(3 * delaiLien, () => ackRecu(numero));
    }
  }

  // ---------- run ----------

  morceaux.forEach((m, k) => sched.at(k * intervalle, () => envoyer(m.numero)));
  sched.run();

  const complet = arrives === n;
  const manquants = morceaux.filter((_, i) => !recepteur[i]).map((m) => m.numero);
  if (!complet) {
    log('fin', null, null, 'R', mode === 'sans'
      ? `Plus rien ne circule et personne ne renvoie rien : ${manquants.length > 1 ? 'il manque les morceaux' : 'il manque le morceau'} ${manquants.join(', ')}. Le message reste troué.`
      : `Plus rien ne circule : ${manquants.length > 1 ? 'il manque les morceaux' : 'il manque le morceau'} ${manquants.join(', ')}.`);
  }

  const result = {
    mode,
    complet,
    tempsTotal: complet ? tempsComplet : events.at(-1).t,
    transmissions: compteurs.transmissions,
    retransmissions: compteurs.retransmissions,
    doublons: compteurs.doublons,
    messageRecu: morceaux.map((m, i) => recepteur[i]?.texte ?? '□'.repeat([...m.texte].length)).join(''),
  };
  return { morceaux, events, trajets, result };
}
