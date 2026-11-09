# Traces attendues, écrites à la main

Pour chaque topologie, le trajet PC-A → PC-B est déduit **à la main** du fichier de la topologie et des règles réseau (CLAUDE.md, § 10.3 de la description), sans regarder le moteur. Il est ensuite comparé à ce qu'affiche PacketLab (`node tests/print-log.js <topologie> PC-A PC-B`).

Résultat (9 novembre 2026) : **les 5 topologies sont conformes**. Ces traces sont devenues des tests automatiques : `tests/traces.test.js` (et `tests/engine.test.js` pour l'exemple mixte du § 7.1).

Au départ, les tables ARP et MAC sont vides ; les tables de routage sont remplies.

---

## 1. Mixte (exemple travaillé du § 7.1)

PC-A 192.168.1.10/24 → PC-B 192.168.2.20/24, deux routeurs.

| Tronçon | MAC source → destination | IP | TTL |
|---|---|---|---|
| PC-A → R1 | AA:AA:AA:00:00:0A → 11:11:11:00:00:01 | 192.168.1.10 → 192.168.2.20 | 64 |
| R1 → R2 | 11:11:11:00:00:02 → 22:22:22:00:00:01 | inchangées | 63 |
| R2 → PC-B | 22:22:22:00:00:02 → BB:BB:BB:00:00:0B | inchangées | 62 |

Requêtes ARP : PC-A pour sa passerelle 192.168.1.1, R1 pour 10.0.0.2, R2 pour 192.168.2.20. **Conforme.**

## 2. Étoile (un switch, un seul réseau)

PC-A 192.168.1.10 → PC-B 192.168.1.11, même réseau : PC-A cherche directement la MAC de PC-B.

1. Requête ARP « Qui a 192.168.1.11 ? », AA:..:0A → FF:FF:FF:FF:FF:FF.
2. SW1 apprend AA:..:0A sur p1 et diffuse sur p2, p3, p4. PC-C et PC-D l'ignorent ; PC-B note 192.168.1.10 → AA:..:0A et répond.
3. Réponse BB:..:0B → AA:..:0A. SW1 apprend BB:..:0B sur p2 et transmet sur p1 seulement.
4. Données AA:..:0A → BB:..:0B, TTL 64. SW1 transmet sur p2 seulement. PC-B reçoit avec TTL 64 (aucun routeur).

Tables à la fin : SW1 {AA → p1, BB → p2} ; PC-A {192.168.1.11 → BB} ; PC-B {192.168.1.10 → AA}. **Conforme.**

## 3. Bus (un câble partagé)

Même échange que l'étoile, mais sans switch : chaque trame (requête, réponse, données) arrive à **toutes** les stations. Seule celle qui est concernée la garde, les deux autres l'ignorent (6 « ignore » en tout). Le bus n'a aucune table. PC-B reçoit les données avec TTL 64. **Conforme.**

## 4. Anneau (A → B → C → D → A, un seul sens)

1. La requête ARP part de PC-A vers PC-B. PC-B est la cible : il note PC-A, répond, et **fait suivre** la requête (une diffusion fait le tour). Elle passe par PC-C, PC-D, revient à PC-A, qui la retire de l'anneau.
2. La réponse BB → AA ne peut pas revenir en arrière : elle fait **le grand tour** B → C → D → A. PC-C et PC-D la font suivre sans la garder.
3. Données AA → BB : un seul saut, A → B. TTL 64. **Conforme.**

## 5. Maillée (quatre routeurs, plusieurs chemins)

PC-A 192.168.1.10 → PC-B 192.168.2.20. R1 a deux routes possibles : 192.168.2.0/24 via R2 et la route par défaut 0.0.0.0/0 via R3. **Le préfixe le plus long (/24) gagne** : le paquet passe par R2.

| Tronçon | MAC source → destination | TTL |
|---|---|---|
| PC-A → R1 | AA:AA:AA:00:00:0A → 11:11:11:00:00:01 | 64 |
| R1 → R2 | 11:11:11:00:00:02 → 22:22:22:00:00:01 | 63 |
| R2 → R4 | 22:22:22:00:00:02 → 44:44:44:00:00:02 | 62 |
| R4 → PC-B | 44:44:44:00:00:01 → BB:BB:BB:00:00:0B | 61 |

Requêtes ARP : PC-A pour 192.168.1.1, R1 pour 10.0.12.2, R2 pour 10.0.24.2, R4 pour 192.168.2.20. IP inchangées tout du long. **Conforme.**

**Retour (exemple « aller-retour ») : un autre chemin.** La route de R4 vers 192.168.1.0/24 passe par R3, pas par R2 :

| Tronçon | MAC source → destination | TTL |
|---|---|---|
| PC-B → R4 | BB:BB:BB:00:00:0B → 44:44:44:00:00:01 | 64 |
| R4 → R3 | 44:44:44:00:00:03 → 33:33:33:00:00:02 | 63 |
| R3 → R1 | 33:33:33:00:00:01 → 11:11:11:00:00:03 | 62 |
| R1 → PC-A | 11:11:11:00:00:01 → AA:AA:AA:00:00:0A | 61 |

PC-B n'a pas besoin d'ARP (il a appris la MAC de R4 grâce à la requête de R4), R1 non plus (il connaît PC-A depuis la première requête). Seuls R4 (pour 10.0.34.1) et R3 (pour 10.0.13.1) demandent. **Conforme.**
