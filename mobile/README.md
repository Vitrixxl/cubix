# Cubix Mobile

Application Expo / React Native pour Android. Les écrans sont natifs : chronomètre,
algorithmes, entraînement, compte, succès, préférences et guides hors ligne.
Le moteur de cube, le catalogue, les formats, les statistiques et le client de
synchronisation sont partagés avec le dépôt.

## Lancer sur ce PC

Depuis la racine du dépôt :

```sh
bun run mobile
```

Cette commande démarre l’émulateur Android `cubix` dans une fenêtre, installe l’APK
release et ouvre Cubix. Le premier lancement construit l’APK s’il est absent. La
version release est autonome : aucun serveur Metro ni compte Expo n’est nécessaire.

Après des changements dans le code :

```sh
bun run build:android
bun run mobile
```

APK à transférer sur un téléphone Android : **`mobile/build/cubix-release.apk`**.

Pour un téléphone ARM64 uniquement (APK plus léger, sans les bibliothèques de
l’émulateur x86_64), lancer `bun run build:android --arm64` depuis la racine.
Le fichier produit est `mobile/build/cubix-release-arm64.apk` ; l’APK universel
reste disponible pour tester sur le PC.
Il contient les architectures **arm64-v8a** (téléphones) et **x86_64** (émulateur PC).

### Version, mise à jour et signature

`app.config.ts` complète `app.json` : le `versionCode` Android et
`Constants.expoConfig.extra.build` reçoivent la date du commit en minutes, et
`extra.commit` le SHA. `CUBIX_BUILD_NUMBER` et `CUBIX_COMMIT` remplacent ces
valeurs. `app.config.ts` fixe aussi la `runtimeVersion` d'expo-updates : un hachage des
fichiers natifs (`NATIVE_INPUTS`), et l'URL des mises à jour, `<API>/api/mobile/updates/manifest`.

Deux chemins de mise à jour existent. Le JavaScript et les assets voyagent à la volée :
`bun scripts/export-update.ts` exporte le bundle dans `build/updates/` avec un
`update.json` que `bun run deploy` (racine) publie sur l'API. Au lancement, `StartupGate`
garde l'écran natif pendant que `startupUpdate` vérifie les mises à jour ; sans mise à jour
l'application s'ouvre directement. Quand un bundle se télécharge, l'écran `Launcher`
affiche un cube mélangé qui se résout, le même écran que le lanceur desktop, puis
l'application redémarre dessus ; le cube se remélange puis se résout de nouveau tant que
le téléchargement dure.
Sans connexion (le serveur ne répond pas à `GET /api/mobile/release` en 6 s), la version
installée s'ouvre directement et une notification « Mode hors ligne » l'annonce.
Les paramètres relancent la vérification et affichent « Restart to update » quand un
bundle attend. Une mise à jour n'est servie qu'aux APK de même `runtimeVersion`.
Quand le natif change (dépendance, app.json, plugin, icône, police), la runtime version
change avec lui : `bun run deploy` compile alors l'APK ARM64 et l'envoie ; les paramètres
proposent « Download update », qui ouvre `/api/mobile/apk`. Le navigateur télécharge le
fichier et Android propose l'installation par-dessus la version en place, à condition
que la signature soit la même. Les builds debug (`bun run pc`) ignorent expo-updates et
chargent le code depuis Metro.

Les mises à jour à la volée sont signées (code signing d'expo-updates, RSA-SHA256,
`keyid` `main`). `export-update.ts` écrit le manifeste complet (adresses des assets
comprises) et le signe avec `~/.config/cubix/keys/expo-updates/private-key.pem`
(`CUBIX_UPDATES_SIGNING_KEY` pour un autre chemin) ; l'API stocke ce texte et le sert tel
quel avec l'en-tête `expo-signature`, sans jamais voir la clé. L'APK embarque le
certificat public `certs/certificate.pem` et refuse tout manifeste non signé par cette
clé : un serveur compromis ou une fuite de `CUBIX_ADMIN_PASSWORD` ne suffisent plus à
pousser du code. Seuls les APK compilés avec le certificat vérifient : ceux déjà
installés acceptent encore tout jusqu'à la mise à jour de l'APK. Sans la clé, l'export
reste possible mais non signé, et `bun run deploy` refuse de le publier.

La clé privée n'existe que sur la machine de déploiement : la **sauvegarder** (hors du
dépôt, chiffrée). Perdue, plus aucune mise à jour à la volée n'atteint les téléphones
avant un nouvel APK (certificat changé, donc nouvelle `runtimeVersion`). La paire a été
créée une seule fois par :

```sh
bunx expo-updates codesigning:generate --key-output-directory ~/.config/cubix/keys/expo-updates \
  --certificate-output-directory certs --certificate-validity-duration-years 30 --certificate-common-name Qbix
```

La clé release est hors du dépôt, dans `~/.config/cubix/keys/` (dossier en 700) :
`android-release.p12` (alias `cubix`), `android-lineage.bin` et `android-release.env`, qui
exporte `CUBIX_ANDROID_KEYSTORE`, `CUBIX_ANDROID_KEYSTORE_PASSWORD`, `CUBIX_ANDROID_KEY_ALIAS`,
`CUBIX_ANDROID_KEY_PASSWORD` et `CUBIX_ANDROID_LINEAGE`. **Sauvegarder ce dossier hors de ce PC** :
sans cette clé, plus aucune mise à jour ne s'installera sur les téléphones.

`bun run deploy` lance `scripts/build-apk.ts --production`, qui charge ce fichier
(`CUBIX_ANDROID_SIGNING_ENV` désigne un autre chemin) et échoue s'il manque. Gradle signe avec
la clé release (`plugins/withReleaseSigning.js`), puis `scripts/release-signing.ts` re-signe
avec apksigner : v3 avec la clé release et la lignée, v2 avec l'ancienne clé de debug publique.
Android 9+ accepte ainsi la mise à jour par-dessus les APK signés en debug et refuse ensuite
tout APK signé avec la seule clé de debug ; Android 7 et 8 (minSdk 24) ne lisent que le v2 et
restent sur la clé de debug. Le déploiement refuse d'envoyer un APK dont le signataire n'est pas
la clé release (`bun scripts/release-signing.ts <apk>` fait la même vérification). Les autres
builds (`bun run apk`, émulateur) gardent la clé de debug et ne sont jamais envoyés.

La lignée a été créée une fois avec `apksigner rotate --out android-lineage.bin --old-signer --ks
android/app/debug.keystore … --set-rollback false --new-signer --ks android-release.p12 …`.

## Installation et développement

Installer les dépendances depuis la racine puis dans le projet mobile :

```sh
bun install
cd mobile
bun install
bun run typecheck
bun run doctor
```

`bun install` génère aussi le bundle des générateurs cubing.js et copie les 99 schémas PNG
des puzzles non cubiques (`assets/cases/*.png` du dépôt, produits par `bun scripts/build-case-images.ts`
à la racine : l'application affiche des bitmaps, car chaque élément d'un SVG devient une vue native). Node et Bun sont nécessaires ; les versions sont
indiquées dans le `package.json` racine.

Chaîne Android de ce PC, installée sans paquets système :

- JDK 17 : `~/.local/share/jdk`
- SDK : `~/.local/share/android`
- Plateforme / build-tools Android 36, platform-tools et émulateur
- Image `system-images;android-36;google_apis;x86_64`
- NDK et CMake : installés par Gradle lors du premier build

Sur un autre PC, installer ces outils avec le SDK Manager Android, puis définir
`JAVA_HOME` et `ANDROID_HOME` si leurs emplacements diffèrent. Sous Linux,
l’émulateur utilise `/dev/kvm`. `scripts/env.sh` ajoute les outils locaux au `PATH`.

Pour développer avec rechargement à chaud :

```sh
cd mobile
bun run android
```

Pour construire sans lancer l’émulateur :

```sh
cd mobile
bun run apk                       # APK release autonome
bun run apk --debug               # APK debug ; nécessite Metro
bun run start                     # Metro pour le debug
bun run pc --build                # rebuild release puis lancement
bun run pc --headless             # émulateur sans fenêtre, pour les tests
bun run serve:apk                 # sert build/cubix-release-arm64.apk sur le réseau local (port 8790)
```

Le build régénère les sources et, lorsque la configuration native change, le projet
Android. `bun run apk --prebuild` force cette régénération. Le répertoire `android/`
est généré et ignoré par Git ; les modifications natives durables doivent être
exprimées dans la configuration Expo ou un config plugin.

L’API utilisée par défaut est `https://cubix.vitrixxl.fr`. Pour un serveur de test,
définir **`EXPO_PUBLIC_API_ORIGIN` avant le build ou le démarrage de Metro**. Depuis
l’émulateur Android, l’adresse de l’hôte est `http://10.0.2.2:PORT`.

## Fonctionnalités et architecture

- Chronomètre tactile : maintien 300 ms, relâchement pour démarrer, tap pour arrêter ;
  pénalités +2 / DNF, détails et menu par appui long pour supprimer ou partager.
- Tous les puzzles, types de mélanges et modes du catalogue partagé ; historiques
  séparés par puzzle, mode et type de mélange.
- Catalogue par étapes et groupes, variantes des sets, suivi des cas appris,
  statistiques, graphiques et liens vidéo.
- Entraînement : recherche et sélection, sélection de sets/groupes, AUF aléatoire,
  solution masquée, navigation précédent/suivant et annulation du dernier temps.
- Compte, fusion des temps invités, synchronisation différée et succès calculés
  localement à partir des temps synchronisés.
- Thèmes clair/sombre et six accents, guides natifs disponibles sans le site web.
- Navigation mobile : quatre onglets en bas, Timer, Train, Learn et Profile, l'onglet
  courant sur une pastille teintée qui glisse d'un onglet à l'autre. Train regroupe les
  exercices (pratique libre, révision, Cross + 1), l'apprentissage quotidien d'un set et le
  duel ; Learn réunit les cours (une méthode pas à pas) et la bibliothèque d'algorithmes,
  derrière un sélecteur Courses / Algorithms ; Profile affiche les statistiques, et chaque
  section (Timer, Training, Achievements, Battles) s'ouvre en page ; les réglages sont
  derrière l'engrenage. Chaque onglet revient à la page qu'il montrait ; toucher l'onglet
  courant ramène à sa première page ; le retour Android, sans historique, ramène au Timer
  avant de quitter. Changer d'onglet fait un fondu, ouvrir une page la fait glisser depuis
  la droite. La barre disparaît quand le clavier est ouvert et pendant un solve.
- Aucun chargement après le lancement : catalogue, statistiques et succès sont
  lus de façon synchrone depuis le stockage local et préchauffés au démarrage ;
  les rares attentes affichent un squelette de la page à venir. Le seul écran
  d'attente est celui du démarrage, avec le cube animé partagé avec le desktop
  (`src/client/lib/launcherCube.ts`).
- Écrans limités à la hauteur de la fenêtre ; listes et fiches ont leur propre zone
  de défilement. Panneaux adaptés au format de l’écran.

`App.tsx` contient le thème, les safe areas et la navigation avec retour Android.
`src/state.ts` persiste les préférences dans MMKV ; `src/api.ts` branche le client
local partagé sur ce stockage. Le chronomètre ne rafraîchit que son affichage ;
les animations utilisent le pilote natif. Le catalogue, la sélection des cas,
la galerie du profil et l’historique du chronomètre utilisent des listes virtualisées.
L’écran reste allumé pendant la pratique.

La seule WebView est invisible : elle exécute les moteurs cubing.js qui utilisent
WebAssembly, absent de Hermes. Elle embarque une page autonome, sans site distant.
Les autres mélanges s’exécutent directement dans le code partagé. Les premières
initialisations des moteurs de recherche peuvent prendre plusieurs secondes.

Les raccourcis clavier du web sont remplacés par les contrôles tactiles. Les vidéos
et sources externes s’ouvrent dans le navigateur Android. Le backend reste nécessaire
pour les comptes et la synchronisation.

## Vérifications

Depuis la racine :

```sh
bun run typecheck
bun run --cwd mobile typecheck
bun run --cwd mobile doctor
bun run --cwd mobile test
bun run --cwd mobile test:scrambler # Chromium/Brave ou CHROMIUM_PATH
bun test tests/practice-scramble.test.ts tests/training-history.test.ts tests/local-first.test.ts tests/niche-catalog.test.ts tests/api-client.test.ts tests/multi-cube.test.ts tests/achievements.test.ts
```

Les tests partagés utilisent des bases temporaires, sans modifier les comptes du
serveur de production. Les parcours tactiles et le rendu doivent également être
vérifiés sur l’APK release dans l’émulateur et, avant distribution, sur un appareil
physique. Les résultats de validation du port sont consignés dans `VALIDATION.md`.
