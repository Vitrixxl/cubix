# Consignes pour les agents

Pousser `main` ne déploie rien. La mise en prod se lance en arrière-plan, sans
bloquer le travail :

```sh
bun run deploy:bg            # pousse main, puis déploie une copie du commit en arrière-plan
bun run deploy:bg --status   # le déploiement en cours et le dernier log
```

`scripts/deploy-background.ts` pousse `main`, extrait le commit dans un worktree
sous `~/.cache/cubix-deploy`, puis y lance `bun run deploy` (`scripts/deploy.ts`,
avec `--no-push`) détaché : `ssh vitrix@82.67.236.74 pihost update cubix`, la
publication de la mise à jour OTA, les paquets desktop s'ils ont changé et, si le
natif a changé, l'APK ARM64 compilé en local puis envoyé à l'API. On peut
continuer à modifier, commiter ou pousser pendant ce temps. Le log est dans
`~/.cache/cubix-deploy/logs/` et une notification bureau dit comment il s'est
terminé. Lire le log à la fin, vérifier que le déploiement a réussi et signaler
toute erreur. `bun run deploy` reste disponible pour un déploiement au premier plan.

Avant de valider quoi que ce soit (commit, push, mise en prod), lancer le dev
dans Docker et laisser l’utilisateur valider lui-même la modification :

```sh
bun run dev:docker             # API seedée dans Docker + site local sur http://127.0.0.1:5181
bun run dev:docker --electron  # la même chose dans la fenêtre Electron
```

Si la stack tourne déjà (conteneur `cubix-dev-api-1`, site sur le port 5181),
la réutiliser au lieu d’en lancer une autre. Une modification de `rust-api`
demande de reconstruire le conteneur (relancer `bun run dev:docker`). Donner
à l’utilisateur l’URL et les étapes pour voir le changement (comptes seedés :
`dev`, `coach`, `lena_speed`, `alex_cubes`…, mot de passe `cubix-dev-password`),
puis attendre son accord explicite avant de commiter ou de pousser. Les tests
headless restent obligatoires mais ne remplacent pas cette validation.

Les écrans de l’application doivent rester à la hauteur de la fenêtre, sans
défilement de la page. Placer les textes explicatifs dans les pages de guides
accessibles via l’aide, jamais sous l’espace de pratique.

Tous les tests doivent être exécutés en headless, sans ouvrir de fenêtre sur le
bureau utilisateur. Pour Electron sous Linux, utiliser `xvfb-run -a`; pour
l’émulateur Android, utiliser `-no-window` avec des données de test isolées.

Le PC de l’utilisateur peut être utilisé à pleine puissance : pas de `nice`
ni de priorité basse, et les tâches lourdes indépendantes peuvent tourner en
parallèle.

## Façon de travailler

L’utilisateur envoie souvent plusieurs demandes d’un coup. Lancer un sous-agent
par tâche, en parallèle (avec un worktree isolé quand deux tâches touchent les
mêmes fichiers). Les sous-agents ne relisent pas leur propre travail et ne
commitent pas : la relecture, les tests, les captures et le rapport se font une
seule fois, à la fin, sur l’ensemble.
