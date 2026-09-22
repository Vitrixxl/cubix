# Catalogue et modes de pratique

## Puzzle, mélange et mode de résolution

Le sélecteur **2×2 à 7×7 / Square-1 / Pyraminx / Skewb / Megaminx / Clock** dans la barre de navigation
est un simple menu déroulant natif qui fixe le puzzle pour toute l’application.
Le mode **Standard / One-handed / Blindfolded** se règle avec les boutons du Playground.
Catalogue, entraînement, mélanges, temps et progression
des profils suivent ce choix. Il est mémorisé à la réouverture. Chaque cube conserve sa sélection
de cas, son dernier mélange et ses préférences de catalogue. Le changement est verrouillé pendant
l’armement, le chronométrage et l’enregistrement d’un temps.

- **2×2** : Ortega OLL (7 cas) et PBL (5 cas).
- **3×3** : catalogue CFOP (228 cas) et ZBLL complet (472 cas en 7 sets : T, U, L, Pi, H, S, AS).
  ZBLL reste propre au 3×3 (`big_cubes: false` dans `catalog-sets.json`) pour ne pas alourdir le catalogue.
- **4×4 à 7×7** : exercices de centres, appariement des arêtes et parités par profondeur,
  puis les 228 cas CFOP adaptés à la résolution après réduction. Les exercices de centres
  et d’arêtes couvrent des séquences utiles ; la construction intuitive n’est pas un catalogue exhaustif.
  Les cubes pairs ont aussi les parités OLL et PLL après réduction.

Le type **Random moves** utilise 11, 22, 40, 60, 80 et 100 mouvements selon la taille,
avec des mouvements larges jusqu’à la moitié du cube et sans deux axes consécutifs identiques.
Ce sont des mélanges par mouvements aléatoires, pas des mélanges officiels WCA à état aléatoire.
Aucun rendu 3D : chaque cas est illustré par un schéma SVG statique (cubes) ou par une image
générée par cubing.js (Square-1, Pyraminx, Skewb, Megaminx, Clock). Le chronomètre affiche le mélange
en notation et rien d’autre.

Le Playground propose les types compatibles avec le puzzle : mélanges d’épreuve via cubing.js,
2-gen (RU, LU, RF, MU), 3-gen (RUL, RUF), demi-tours, arêtes seules, coins seuls,
dernière couche, cas OLL/PLL/F2L et couches extérieures des grands cubes.
Les cas sont tirés du catalogue ; les générateurs restreints par mouvements ne prétendent pas
échantillonner uniformément tous les états. **Event scramble** sert à l’entraînement personnel ;
les compétitions officielles utilisent leurs propres mélanges. Square-1, Pyraminx, Skewb,
Megaminx et Clock ont également leur catalogue et leur entraînement : **99 cas dans 18 groupes**.

- **Square-1** : 29 cas de forme cubique, orientation et permutation des coins/arêtes, parité et tranche centrale.
- **Pyraminx** : 11 cas de pointes, insertions et dernière couche.
- **Skewb** : 7 cas de coins et cycles de centres pour la méthode débutante.
- **Megaminx** : 34 exercices de paires et cas d’orientation/permutation de dernière couche.
- **Clock** : 18 exercices de groupes de cadrans, face arrière et alignement complet.

Ces catalogues couvrent des méthodes débutantes et intermédiaires ainsi que des exercices ciblés ;
ils ne recensent pas toutes les variantes avancées. Chaque cas a un setup, une solution et un schéma.
Les AUF aléatoires restent réservés aux cubes NxN. Sur Clock, les séquences servent à travailler
les groupes de cadrans ; une résolution libre demande d’adapter les rotations à leur état.

En blindfolded, le temps enregistré inclut mémorisation et exécution, sans chronos séparés.

Chaque session et chaque temps enregistrent **`puzzle_id`, `solve_mode`, `scramble_type`**
en local et dans SQLite. `cube_size` reste disponible pour les cubes et vaut `null` pour les autres puzzles.
Ces labels suivent les données lors de la synchronisation, de l’import invité et du partage.
L’historique et les moyennes du Playground sont isolés par ces trois dimensions ; les profils
permettent de filtrer le type de mélange, et les statistiques de cas sont séparées par mode de résolution.
La migration conserve les anciennes données : puzzle déduit de `cube_size` (3×3 sinon),
mode `standard`, type `random-moves` pour le Playground ou `case` pour l’entraînement.

Les API acceptent `puzzle`, `solveMode` et `scrambleType` dans les filtres et les créations.
Par exemple : `?puzzle=333&solveMode=one-handed&scrambleType=2gen-ru`.
Un temps hérite du contexte de sa session et les contextes incompatibles sont rejetés.

Les sessions appartiennent au lancement de l’application : chaque démarrage du client PC ou
mobile ouvre sa propre session par contexte (créée au premier temps), jamais reprise d’un
lancement précédent ni d’un autre appareil. Le panneau des temps et les statistiques de la page
ne montrent que cette session ; les temps sont tout de même synchronisés et comptent dans le
profil, où l’historique reste global.
Le paramètre historique `cubeSize` reste accepté. Les identifiants et compatibilités sont définis
dans `../data/puzzles.json`, partagé avec Rust.
Le build distribue cubing.js et ses workers dans le dossier `vendor/cubing/` du paquet, sans dépendre d’un CDN.

## Un seul catalogue : `data/catalog.json`

Tous les clients lisent le même fichier généré, `../data/catalog.json` : le serveur Rust l'embarque
avec `include_str!`, le client local TypeScript (desktop et mobile) l'importe, `desktop/scripts/export-assets.tsx`
en rend les schémas SVG et `mobile/scripts/build-cases.ts` y résout les schémas des puzzles non cubiques
(`scripts/build-case-images.ts` rasterise leurs SVG en PNG dans `assets/cases/`, versionnés, pour le mobile).
Aucun client ne fusionne plus les sources lui-même. Le fichier contient `sets`, `cases` (CFOP, réduction
4×4–7×7, multi-cube, puzzles non cubiques), `puzzles` et `moves`.

```sh
bun run build:catalog   # multi-cube + niche + assemblage de data/catalog.json
```

Les entrées curées restent dans `data/` : `catalog-sets.json` (métadonnées des sets CFOP, dans l'ordre),
`f2l*.json`, `oll.json`, `pll.json`, `2look-*.json`, `zbll-*.json`, `multi-cube.json`, `niche-catalog.json`,
`puzzles.json` et `moves.json`. Le test `tests/catalog.test.ts` échoue si `catalog.json` n'a pas été
régénéré après une modification de ces entrées.

Les schémas de cube (géométrie isométrique, vue dernière couche OLL/PLL, couleurs et masques) viennent
de `src/shared/cubeDiagram.ts` ; le web, l'export desktop et `react-native-svg` dessinent les mêmes
cellules, donc un cas a la même image partout. Le mobile les reçoit fusionnées en un chemin par couleur
(`diagramPaths`, mémorisé par état) : une poignée de vues natives par schéma au lieu d'une par facette.

`bun scripts/build-cube-catalog.ts` reconstruit `../data/multi-cube.json`, partagé par les clients natifs
et le serveur Rust. Les sources des nouveaux algorithmes sont conservées avec chaque cas :
[J Perm Ortega](https://www.jperm.net/algs/2x2/oll), [PBL](https://www.jperm.net/algs/2x2/pbl),
[4×4](https://www.jperm.net/4x4) et [SpeedCubeDB L2E](https://www.speedcubedb.com/a/5x5/L2E).
Les commutateurs de centres sont des exercices Cubix ; les tests vérifient les pièces affectées,
les setups inverses, les AUF et l’équivalence de chaque algorithme CFOP après réduction.

`bun scripts/build-niche-catalog.ts` reconstruit `../data/niche-catalog.json` et les schémas dans `assets/cases`.
Sources : [Jaap](https://www.jaapsch.net/puzzles/), [CubeZone](https://www.cubezone.be/square1.html),
[Speedcube](https://www.speedcube.com.au/blogs/pyraminx-beginner), [Sarah Strong](https://sarah.cubing.net/skewb/my-method),
[Cubing World](https://www.youtube.com/watch?v=Fyl7-RgkfCs) et
[CubeSkills](https://www.cubeskills.com/uploads/pdf/tutorials/intermediate-megaminx-techniques.pdf).
Les tests vérifient les inverses, les pièces préservées et la légalité des coupes Square-1.

## Sources du catalogue

| Source | Utilisation |
| --- | --- |
| [SpeedCubeDB](https://speedcubedb.com/a/3x3/) | Algorithmes, setups, votes et vidéos ; ZBLL via `bun scripts/fetch-zbll.ts` |
| [J Perm](https://jperm.net/algs/) | Recommandations et groupes OLL/PLL |
| [F2LTrainer](https://github.com/Dave2ooo/F2LTrainer) | Cas F2L standard, avancés et experts |
| [andyjudson/cfop](https://github.com/andyjudson/cfop) | Noms et probabilités |
| [cubing.js](https://js.cubing.net/cubing/) | Vérification et génération des setups |

La croix est en bas (blanc), la dernière face est jaune ; les schémas affichent la face avant bleue et la droite rouge (`src/shared/cubeAppearance.ts`).
Les cas F2L visent le slot avant-droit. Chaque cas ZBLL est vérifié : l'algorithme résout le cube,
le F2L et l'orientation des arêtes sont intacts, et les 472 états sont distincts à un AUF près. Les sources brutes sont conservées dans `data/raw` ;
`bun run build:db` reconstruit et vérifie le catalogue.
