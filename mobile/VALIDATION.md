# Validation du port Android

Vérification locale du 14 septembre 2026. Les résultats ci-dessous concernent le
code et les outils présents dans ce dépôt ; ils ne valent pas mesure sur un
téléphone physique.

## Contrôles automatisés

| Contrôle | Résultat |
| --- | --- |
| TypeScript du dépôt et du projet mobile | Réussi |
| Expo Doctor | 21 contrôles sur 21 |
| Compatibilité des dépendances Expo | Réussie |
| Export Android / Hermes | Réussi |
| Tests partagés : mélanges, entraînement, stockage local, catalogue, API et succès | voir `bun run test` |
| Timer tactile : maintien, arrêt unique, arrière-plan, erreur et nouvelle tentative | 4 tests, 23 assertions |
| Moteur embarqué : 11 événements et 2 orbites 3×3 | 13 scénarios réussis dans Chromium |

Le test du moteur utilise la même page autonome que la WebView native. Il vérifie
la notation des mélanges, leur génération dans le délai imparti et la conservation
des autres orbites lors des mélanges de coins / arêtes. Son résultat détaillé est
généré dans `build/scrambler-validation.json` par `bun run test:scrambler`.

## Parcours natifs

APK release installé et lancé dans un émulateur Android 36, sans Metro. Les tests
utilisent une base SQLite temporaire distincte du serveur de production.

Parcours vérifiés : maintien / relâchement / arrêt et sauvegarde du timer,
pénalités +2 et DNF, génération des 11 puzzles (également hors ligne), catalogue
et détails, sélection de plusieurs cas, AUF, affichage de solution, navigation
entre cas, sauvegarde et annulation en entraînement. Les actions Random moves,
Standard et New scramble sont en bas ; Times reste en haut.

Comptes : inscription, import des temps invités, reconnexion et conservation des
temps. Succès : liste par puzzle, filtres tous / débloqués / verrouillés et
progression. Graphique et tableau de profil contrôlés avec 26 temps. Thèmes clair / sombre et guides embarqués vérifiés.

Les vues de pratique et les listes ont été contrôlées en portrait, sur un format
360 × 640 et en paysage 640 × 360. Les listes défilent dans leur zone ; la page
reste à la hauteur de la fenêtre. La navigation mobile occupe toute la largeur avec quatre onglets à icônes seules
et un bouton Réglages ; contrôlée en portrait 360 × 640 et en paysage 640 × 360,
avec changement d’onglet. La sélection arrondie est dessinée en SVG. Le dialogue
Réglages regroupe les 11 puzzles, le thème, l’accent et l’aide ; le changement de
puzzle et de thème a été vérifié. Le compte regroupe Timer, Training et
Achievements. Les actions du timer sont
espacées de la navigation. Aucun crash JavaScript ou Android observé pendant ces parcours.

Les filtres Learned / Not learned utilisent le statut marqué sur les cas, avec
comptage indépendant des temps. Le parcours web a vérifié 119 cas initiaux, puis
1 learned / 118 not learned, et la persistance après rechargement. Le code du
desktop GPUI passe également cargo check. Dans l’émulateur Android, les deux
filtres et les compteurs ont été vérifiés, y compris le retrait immédiat d’un
cas de la liste lorsque son statut change.

## Périmètre fonctionnel

| Web | Android |
| --- | --- |
| Timer, modes et types de mélanges | Écran natif, maintien / relâchement / arrêt tactile |
| Historiques, pénalités, suppression et partage | Listes et menus tactiles |
| Catalogue, étapes, groupes et variantes | Catalogue natif et listes virtualisées |
| Schémas, setups, algorithmes, sources et vidéos | SVG natifs ; liens externes dans le navigateur Android |
| Sélection, AUF, solutions, navigation et annulation | Entraîneur natif |
| Profils, progression et graphiques | Écrans natifs et graphiques SVG |
| Comptes, amis, conversations et synchronisation | Même API Rust et même client local, stockage MMKV |
| Thèmes et aide | Préférences persistantes et guides embarqués |
| Raccourcis clavier | Contrôles tactiles équivalents |

## Limites de cette validation

- Aucun appareil Android physique n’a encore été testé.
- Le premier démarrage d’un moteur de mélange peut prendre quelques secondes.
- Les vidéos et sources externes nécessitent le réseau.
- L’APK utilise une signature de développement pour l’installation locale. La
  publication sur un store n’est pas configurée.
- L’administration du serveur est un outil d’exploitation web distinct des écrans
  de pratique et de communauté de l’application.
