# Démonstration de 5 minutes (§ 18)

Lien : **https://bahakh-io.github.io/PacketLab/**
Répétée automatiquement sur le site en ligne le 9 novembre 2026 (navigateur neuf, comme l'ordinateur du jury) : tout fonctionne. Les captures de chaque moment sont dans `docs/demo/` (plan B).

## Avant de commencer (2 minutes avant)

- Ouvrir le lien une fois et parcourir les pages : elles sont alors en cache.
- Choisir le thème : clair pour un vidéoprojecteur (bouton lune/soleil en haut à droite).
- Ne pas activer « Prédire d'abord » : la démo utilise les questions déjà prévues.
- Les bulles « À retenir » apparaissent sur un navigateur neuf : un clic sur « Compris » suffit. Pour les revoir : « Réafficher les bulles d'aide » sous le simulateur.
- Garder ouvert, dans un autre onglet, le dossier `docs/demo/` (plan B).

## Le déroulé

| # | Temps | Ce qu'on fait | Ce qu'on dit | Plan B |
|---|---|---|---|---|
| 1 | 0:00 | **Accueil.** Montrer le réseau animé, puis les trois modules. | « PacketLab montre ce qu'un `ping` ne montre pas : le voyage d'un paquet saut par saut. Module A le voyage, module B la fiabilité, module C les cours et quiz. » | `1-accueil.png` |
| 2 | 0:40 | Cliquer **« ▶ Lancer l'exemple PC-A → PC-B »**, puis **Suivant** jusqu'à l'étape 4. Répondre à la question sur le switch (« une copie sur tous ses autres ports »). | « PC-B n'est pas dans le réseau de PC-A : il demande d'abord la MAC de sa passerelle, en diffusion. Le switch apprend l'adresse de PC-A et inonde : il ne modifie jamais la trame. » | `2-arp-switch.png` |
| 3 | 1:40 | **Suivant** jusqu'à la question de l'étape 12 : « R1 va envoyer la trame vers R2. Quelle sera sa MAC source ? ». Faire répondre le jury. | « À vous : quelle MAC source après R1 ? » → 11:11:11:00:00:02, l'interface de sortie e1. | `3-question-r1.png`, `4-reponse.png` |
| 4 | 2:20 | **Suivant** jusqu'à l'étape 16 : l'ancien en-tête Ethernet se détache. Pointer la souris sur R1 (carte avec ses adresses). | « Les MAC changent à chaque routeur, l'IP reste la même de bout en bout, le TTL baisse de 1 : 64 → 63. » | `5-r1-reecrit-les-mac.png` |
| 5 | 3:00 | **Labo fiabilité.** Le morceau 3 est déjà marqué perdu. Choisir **« Comparer les deux »**, **Lancer**, **Lecture** (vitesse 2× ou 4×). Descendre jusqu'aux résultats. | « Sans récupération, le message reste troué. Avec ACK et délai d'attente, l'émetteur renvoie le morceau 3 : message complet, au prix de 160 ms de plus. » | `6-labo-comparaison.png`, `7-labo-resultats.png` |
| 6 | 4:10 | **Quiz → ARP**, répondre à une question, lire la correction. Puis **Progression** : anneaux par thème et badges. | « Chaque réponse est corrigée et renvoie vers le simulateur. La progression est gardée, et sur un compte si l'étudiant en crée un. » | `8-quiz-correction.png`, `9-progression.png` |
| | 5:00 | Fin. | | |

## Plan B

1. **Pas d'internet ou site lent** : copie locale. Ouvrir le dossier du projet dans VS Code, puis « Open with Live Server » sur `index.html`. Tout fonctionne sans le backend (mode invité).
2. **Plus rien ne marche** : les captures de `docs/demo/`, dans l'ordre 1 → 9.
3. **Enregistrement vidéo** (à faire par l'équipe) : sous Windows, Win + Alt + R lance et arrête l'enregistrement de la fenêtre (Xbox Game Bar). Enregistrer une fois la démo complète.

## Questions probables du jury

- *Pourquoi une file d'événements plutôt que des minuteries ?* Le même scénario donne toujours les mêmes étapes : on peut revenir en arrière et rejouer.
- *Les résultats sont-ils justes ?* Les 5 topologies ont été vérifiées à la main (`docs/traces.md`), et ces traces sont des tests automatiques (106 tests, `node --test`).
- *Qu'est-ce qui est simplifié ?* Routes statiques, pas de NAT ni d'ICMP, pas de collisions sur le bus, le labo n'est pas TCP (voir le README).
