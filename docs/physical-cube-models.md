# Modèles de surface des cubes

98 fichiers GLB sont disponibles, du 2×2 au 7×7. Ils ont été construits pour Cubix
à partir des photographies des produits, sans téléchargement de modèles tiers.
Le catalogue de 1 914 références photographiques reste distinct de ces fichiers.
Les faux logos dessinés ont été supprimés ; les reconstructions ne portent pas de
marquage inventé.

## Périmètre et fidélité

Chaque entrée de `data/cube-surface-profiles.json` identifie le produit et sa
variante, la photo originale et son SHA-256, les caractéristiques observées et
les paramètres de sa surface. Les paramètres ont été estimés visuellement à
partir des photos : ce ne sont ni des mesures au pied à coulisse ni des tracés
photogrammétriques automatiques. La correction de perspective des images sert
à l'examen des formes, pas à certifier des dimensions.

Les contours indépendants des centres, arêtes et coins, les rayons des jonctions,
les interstices et les largeurs des rangées extérieures changent suivant les
profils. Les versions avec autocollants possèdent une surface plastique noire
et des autocollants en relief séparés. Le WeiLong GTS3 M a des nervures de prise ;
les MGC Beta, Sigma et Meta3 ont des encoches autour des centres. Les matériaux
distinguent les finitions mates, satinées et UV.

Les profondeurs, biseaux, couleurs et parties non visibles sur les photos restent
estimés. Les petites différences de paramètres ne constituent pas une preuve de
différences de fabrication entre deux références. Deux versions commerciales
peuvent avoir une surface identique. Aucun fichier n'est présenté comme une copie
certifiée exacte du produit réel. Une photographie seule ne donne pas toutes les
cotes. L'interface nomme ces fichiers « Photo reconstruction · exterior surfaces ».
Les mécanismes, aimants et pieds internes ne sont pas reproduits. Un support sombre
ou primaire, en retrait des coques, ferme visuellement les pièces pendant les tours.

## Générer et comparer

```sh
bun scripts/build-cube-surfaces.ts
bun scripts/review-cube-surfaces.ts
```

La première commande génère les 98 GLB et leur manifeste. On peut passer un ou
plusieurs identifiants pour ne régénérer que ces modèles. Les géométries répétées
à l'intérieur d'un fichier partagent leurs buffers, sans regrouper les pièces
mobiles. Le fichier d'un 3×3 courant fait environ 280 Ko ; toute la collection
pèse environ 40 Mo, sans être téléchargée par l'application.

La seconde commande ouvre un outil **local de développement** sur
`http://localhost:5182/`, avec photos et rendus côte à côte, vue de face, perspective
et rotation à 45°. Les pages regroupent neuf modèles. `?id=identifiant` isole un
modèle. Cette galerie de vérification n'est pas incluse dans le site public.

Pour corriger un cube, modifier ses paramètres et observations avec sa propre
photo comme référence, régénérer le fichier puis contrôler les contours de face
et la continuité des pièces en rotation. Ne pas déduire les formes du nom de la
marque, ne pas ajouter de variations aléatoires pour gonfler le nombre de modèles.

## Contrat des fichiers et rotation

- Un GLB 2.0 autonome par produit/variante, sans texture ou buffer externe,
  animation préenregistrée, skin ou extension de compression obligatoire.
- Cube centré à l'origine, côté extérieur de deux unités. X droite, Y haut,
  Z observateur ; U jaune, D blanc, F vert, B bleu, R orange, L rouge.
- Toutes les pièces extérieures sont des nœuds racines distincts, avec
  `extras.cubixPosition` : -1/0/1 pour un 3×3, -1.5/-.5/.5/1.5 pour un 4×4, etc.
- Le renderer conserve les géométries et applique des transformations rigides
  aux pièces. Les tangentes des centres restent suivies pendant les mouvements.
- Les matériaux `face_U/D/F/B/R/L` servent aux masques d'entraînement. Les
  matériaux de deux pièces ne sont pas partagés dans une instance animée.
- Un éventuel noyau fixe importé utilise `extras.cubixCore: true`. Les marquages
  authentiques importés peuvent utiliser `extras.cubixDecal: true` pour être
  masqués pendant certains entraînements.
- Les puzzles non cubiques figurent dans les références mais ne sont pas inclus
  dans ces 98 modèles, dont le moteur de pièces couvre les cubes 2×2 à 7×7.

`bun scripts/register-cube-model.ts metadata.json cube.glb` permet également
l'import d'un GLB externe. Les métadonnées exigent produit, variante, source,
auteur et revue ; soit des dimensions documentées, soit la déclaration explicite
`reconstruction` avec sa photo et `accuracy: estimated-from-photographs`.
La validation technique ne certifie pas la fidélité géométrique.

## Cache navigateur

La sélection est locale, mémorisée par taille. Seul le fichier choisi est chargé.
Cache Storage (`cubix-physical-models-v1`) conserve le GLB complet. Le cache est lu
avant le réseau, y compris après rechargement, et le SHA-256 est vérifié. Les
requêtes simultanées sont regroupées ; Web Locks coordonne les onglets compatibles.
Les fichiers portent leur SHA-256 dans l'URL et sont servis en statique avec
`Cache-Control: public, max-age=31536000, immutable`, sans endpoint API.

Le service worker n'installe pas la collection et conserve le cache des modèles
lors des mises à jour. Effacer les données du site, les limites de stockage ou
l'éviction par le navigateur peuvent imposer un nouveau téléchargement. Un échec
de stockage ne bloque pas l'affichage du fichier déjà reçu. Un échec de chargement
est signalé avec possibilité de réessayer.

## Références photographiques

```sh
python3 scripts/import-cube-references.py
```

Les 1 914 références proviennent de la pagination complète des 4 673 produits de
TheCubicle examinés le 12 septembre 2026. Les images et logos restent liés à leurs
sources. Par exemple, le [FerYooCore V2](https://www.thecubicle.com/products/the-feryoocore-3x3-v2)
est bien une préparation sur base WeiLong V11, et possède sa propre fiche.
Les poids d'expédition ne sont jamais utilisés comme dimensions géométriques.
