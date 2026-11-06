# PacketLab

Application web éducative : choisir une topologie réseau préparée, envoyer un paquet et le suivre saut par saut (adresses MAC/IP, TTL, tables ARP, MAC et de routage).

Projet Web — SUP'COM 2026/2027 · Nour El Houda Fodha, Baha Eddine Khantouch · Encadrante : Mme Nesrine Zaghdoud.

## Lancer en local

Ouvrir le dossier dans VS Code et lancer **Live Server** sur `index.html` (le `fetch` des fichiers JSON ne marche pas en `file://`).

## Tests

```sh
node --test
node tests/print-log.js mixte PC-A PC-B
```

Voir `docs/PLAN.md` pour le plan de travail et `docs/PacketLab_Description_Detaillee.md` pour la description complète.
