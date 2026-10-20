# Consignes pour les agents

Pousser `main` ne déploie rien. La mise en prod se lance en arrière-plan, sans
bloquer le travail :

```sh
bun run deploy:bg            # pousse main, puis déploie une copie du commit en arrière-plan
bun run deploy:bg --status   # le déploiement en cours et le dernier log
```

`scripts/deploy-background.ts` pousse `main`, extrait le commit dans un worktree
sous `~/.cache/cubix-deploy`, puis y lance `bun run deploy` (`scripts/deploy.ts`,
avec `--no-push`) détaché : le site est construit ici (`dist/deploy`) et envoyé
dans le repo du Pi (hors git), où `dist/web` pointe vers lui, puis
`ssh vitrix@82.67.236.74 pihost update cubix` reconstruit l'API, dont le conteneur
monte `dist/web`, et le script attend que le serveur réponde avec ce commit et
serve le site. Un `pihost update` lancé à la main reprend le dernier
site envoyé. On peut continuer à modifier, commiter ou pousser
pendant ce temps. Le log est dans
`~/.cache/cubix-deploy/logs/` et une notification bureau dit comment il s'est
terminé. Lire le log à la fin, vérifier que le déploiement a réussi et signaler
toute erreur. `bun run deploy` reste disponible pour un déploiement au premier plan.

Avant de valider quoi que ce soit (commit, push, mise en prod), lancer le dev
dans Docker et laisser l’utilisateur valider lui-même la modification :

```sh
bun run dev:docker             # API seedée dans Docker + site local sur http://localhost:5181
```

Si la stack tourne déjà (conteneur `cubix-dev-api-1`, site sur le port 5181),
la réutiliser au lieu d’en lancer une autre. Une modification de `go-api`
demande de reconstruire le conteneur (relancer `bun run dev:docker`). Donner
à l’utilisateur l’URL et les étapes pour voir le changement (comptes seedés :
`dev`, `coach`, `lena_speed`, `alex_cubes`…, via la connexion dev par nom
d’utilisateur ; Google aussi si `.env` a `CUBIX_GOOGLE_CLIENT_ID`),
puis attendre son accord explicite avant de commiter ou de pousser. Les tests
headless restent obligatoires mais ne remplacent pas cette validation.

Les écrans de l’application doivent rester à la hauteur de la fenêtre, sans
défilement de la page. Placer les textes explicatifs dans les pages de guides
accessibles via l’aide, jamais sous l’espace de pratique.

Tous les tests doivent être exécutés en headless, sans ouvrir de fenêtre sur le
bureau utilisateur. Pour l’émulateur Android, utiliser `-no-window` avec des
données de test isolées.

Le PC de l’utilisateur peut être utilisé à pleine puissance : pas de `nice`
ni de priorité basse, et les tâches lourdes indépendantes peuvent tourner en
parallèle.

## Façon de travailler

L’utilisateur envoie souvent plusieurs demandes d’un coup. Lancer un sous-agent
par tâche, en parallèle (avec un worktree isolé quand deux tâches touchent les
mêmes fichiers). Les sous-agents ne relisent pas leur propre travail et ne
commitent pas : la relecture, les tests, les captures et le rapport se font une
seule fois, à la fin, sur l’ensemble.

## Qualité du code

`bun run check` (types des trois projets et knip) doit passer avant de rendre la
main : il refuse les variables, paramètres, imports, exports, fichiers et
dépendances inutilisés. Il tourne aussi en tête de `bun run test`, et un hook
Claude Code (`.claude/settings.json`) le lance à la fin de chaque tour.

Chercher avant d’écrire : un utilitaire, un composant ou une règle existe
souvent déjà. Où regarder :

- `src/shared/` : le cube, les puzzles et événements (`eventLabelOf`…), les
  méthodes, les couleurs (`hexOf`), les types partagés avec l’API ;
- `src/client/lib/` : la logique commune au web et au téléphone (`course.ts`,
  `caseState.ts`, `practiceCatalog.ts` avec `groupBySet`, `coaching.ts`,
  `community.ts`, `format.ts` avec `plural` et `effective`, `profile.ts` avec
  `dayKey`…) ;
- web : `desktop/renderer/base.tsx` et `ui.tsx` (boutons, `Surface`, `ROW`,
  `PanelHead`…), `desktop/renderer/components/ui/` (shadcn : Popover, Command,
  Dialog…), le store (`s.setCases`, `s.stat`…) ;
- téléphone : `mobile/src/components/layout.tsx`, `mobile/src/components/ui/`.

Une règle utilisée par le web et le téléphone vit une seule fois dans `src/`,
jamais recopiée de chaque côté. L’interface utilise les composants de l’app,
jamais un élément natif du navigateur ou un style refait à la main. Un export
chargé seulement par `require` porte le tag `@public` pour knip.
