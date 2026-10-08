# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Les cubeurs, du premier solve au niveau compétition, sans profil prioritaire : quand deux besoins s'opposent, aucun
n'est sacrifié à l'autre.

- **Débutant** : apprend sa première résolution, a besoin d'être guidé pas à pas et que la notation soit expliquée.
- **Pratiquant régulier** : ouvre l'app et enchaîne des solves chaque jour ; veut progresser sur ce qui lui fait perdre
  du temps (cas faibles, algorithmes, analyse).
- **Compétiteur WCA** : prépare ses épreuves officielles ; mélanges conformes, pénalités, statistiques par épreuve.
- **Utilisateur de cube connecté** (à venir, voir plus bas) : veut exploiter les mouvements enregistrés.
- **Coach et élève** : réservent une séance, échangent et reviennent sur des solves.

## Product Purpose

Qbix est une application de speedcubing : chronométrer, apprendre et s'entraîner sur toutes les épreuves WCA, et voir
sa progression. Le compte ne sert qu'à synchroniser ses temps entre appareils.

## Positioning

Trois choses à la fois, qu'aucun voisin (csTimer, Twisty Timer, Cubeast…) ne réunit :

1. **Tout-en-un** : chrono, algorithmes, entraînement par cas, cours, duels et statistiques dans une seule app.
2. **Gratuit** : y compris ce que d'autres réservent à une offre payante.
3. **Fait pour progresser, pas seulement pour chronométrer** : l'app montre où le temps se perd et propose quoi
   travailler.

## Operating Context

- Une séance, c'est un cube en main et des dizaines de solves d'affilée : mélanger, maintenir, lâcher, résoudre,
  arrêter. Clavier (espace) sur ordinateur, écran tactile sur téléphone.
- La même application sur le web (PWA installable), dans une fenêtre desktop (Electron, ou Tauri, plus léger, sur
  le moteur web du système : Windows, Linux, macOS) et sur Android (React Native, écrans natifs). Le web est la
  référence de design ; Android reprend le même langage visuel, adapté au tactile.
- Hors ligne d'abord : chaque solve est enregistré sur l'appareil, puis synchronisé.
- On arrive souvent d'un autre timer avec des années d'historique à importer.

## Capabilities and Constraints

- **Chrono** : les épreuves WCA (2×2 à 7×7, une main, à l'aveugle, Square-1, Pyraminx, Skewb, Megaminx, Clock),
  mélanges à état aléatoire générés sur l'appareil, mélanges d'entraînement, moyennes (Ao5, Ao12, AoX), +2 et DNF
  selon le règlement WCA, bande de statistiques que l'on compose soi-même.
- **Algorithmes** : catalogue de 1 755 cas et 6 508 algorithmes (F2L, OLL, PLL, ZBLL, autres puzzles), lecteur 3D.
- **Entraînement** : pratique libre par cas, apprentissage quotidien, révision, cross + 1.
- **Cours** : du premier solve à CFOP, Roux et ZZ, et les méthodes des autres puzzles.
- **Duels** en direct, appariés par niveau.
- **Statistiques et profil** : courbe de tous les solves, records, calendrier de pratique, succès.
- **Cube connecté : en développement, à ne pas annoncer.** Le suivi du mélange et l'analyse CFOP étape par étape
  (cas reconnus, rejeu, calculée sur l'appareil) existent, mais seulement avec le cube virtuel des builds de
  développement : aucun vrai cube Bluetooth n'est encore pris en charge.
- **Coaching** : réservation de séances, messagerie, appels avec partage d'écran. Chaque coach fixe son prix.
- **Import** depuis csTimer, Twisty Timer, Cubic Timer, CubeTime, CubeDesk, ZKT Timer, Cubeast, acubemy et
  Speedcuber Timer.
- Les écrans de l'application tiennent dans la hauteur de la fenêtre, sans défilement de page ; les textes
  explicatifs vont dans les guides. La page d'accueil du site, elle, défile.
- Les contrôles de l'interface sont les composants shadcn du projet.
- Interface en anglais.
- Pas d'application iOS : sur iPhone et iPad, Qbix s'utilise dans Safari.
- Desktop Linux : x64 seulement. macOS : compilé depuis les sources.

## Brand Commitments

- **Le nom public est Qbix.** « cubix » reste le nom technique (dépôt, domaine `cubix.vitrixxl.fr`, commande).
- **Gratuit, sans publicité ni offre premium** : toutes les fonctions de l'app, pour tout le monde. Cela peut
  s'écrire tel quel. (Les séances de coaching sont payées au coach ; l'auteur accepte un don, « Buy me a coffee ».)
- **Open source** : le code est public sur GitHub et peut être mis en avant.
- **Hors ligne d'abord** : l'app doit toujours fonctionner sans connexion.
- Projet indépendant, sans lien avec Rubik's Brand Ltd ni la World Cube Association.

## Evidence on Hand

- Captures de l'application : `desktop/assets/landing/` (chrono, algorithmes, cours, profil), prises par
  `desktop/scripts/landing-shots.ts`.
- Le catalogue : `desktop/assets/catalog.json`.
- Une résolution CFOP réelle, calculée par le solveur de l'app : `desktop/renderer/landing/solve.ts`.
- Le texte du site, limité à ce que l'app fait : `desktop/renderer/landing/content.ts`.
- Une étude du marché, des utilisateurs et des modèles économiques : `docs/recherche-cubing/`.
- **Absents, à ne pas inventer** : témoignages, nombre d'utilisateurs, notes de stores, presse, comparatifs chiffrés.

## Product Principles

1. **Ne jamais perdre un temps.** Enregistré sur l'appareil d'abord, importable, synchronisé ensuite.
2. **Rien entre le cubeur et son solve.** Le chrono s'ouvre et s'enchaîne sans friction ; l'explication vit dans les
   guides, pas sur l'écran de pratique.
3. **Du premier solve à la compétition, la même app.** Aucune fonction réservée à un niveau ou à une offre.
4. **Montrer quoi travailler.** Une statistique mène à un exercice.
5. **Ne dire que ce que l'app fait.** Aucune promesse au-delà des fonctions présentes.
