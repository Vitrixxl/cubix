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

Le build signe l'APK avec le keystore désigné par `CUBIX_ANDROID_KEYSTORE`,
`CUBIX_ANDROID_KEYSTORE_PASSWORD`, `CUBIX_ANDROID_KEY_ALIAS` et `CUBIX_ANDROID_KEY_PASSWORD`
(plugin `plugins/withReleaseSigning.js`). Sans ces variables, l'APK garde la clé de
développement générée par Expo : les builds s'installent alors les uns par-dessus les
autres, mais cette clé est publique. Changer de clé oblige à désinstaller
l'application une fois. Créer le keystore :

```sh
keytool -genkeypair -v -keystore cubix.keystore -alias cubix -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 cubix.keystore   # valeur du secret ANDROID_KEYSTORE_BASE64
```

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
- Navigation mobile : barre en bas du layout (pas superposée au contenu), coins
  supérieurs arrondis et fine marge latérale ; icônes Algorithms, Training, Timer
  (au centre), Account et Settings. Elle disparaît quand le clavier est ouvert.
  Account affiche quatre cases (Timer, Training, Achievements, jours actifs) qui
  ouvrent les détails ; les succès sont regroupés par puzzle en cases, chaque
  succès en petite case avec son pourcentage. Settings ouvre le choix du puzzle,
  le thème, l’accent et l’aide.
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
bun test tests/practice-scramble.test.ts tests/training-history.test.ts tests/local-first.test.ts tests/niche-catalog.test.ts tests/catalog-cache.test.ts tests/api-client.test.ts tests/multi-cube.test.ts tests/achievements.test.ts
```

Les tests partagés utilisent des bases temporaires, sans modifier les comptes du
serveur de production. Les parcours tactiles et le rendu doivent également être
vérifiés sur l’APK release dans l’émulateur et, avant distribution, sur un appareil
physique. Les résultats de validation du port sont consignés dans `VALIDATION.md`.
