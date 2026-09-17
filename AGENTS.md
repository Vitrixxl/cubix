# Consignes pour les agents

Chaque `git push` de `main` met automatiquement en prod : un hook Claude Code
(`.claude/settings.json` → `.claude/hooks/deploy-on-push.sh`) lance
`bun run deploy` après tout `git push` de `main` exécuté depuis ce dépôt. La
commande enchaîne `git push`, `ssh vitrix@82.67.236.74 pihost update cubix`, la
publication de la mise à jour OTA et, si le natif a changé, la compilation de
l'APK ARM64 en local puis son envoi à l'API. Elle peut aussi être lancée à la
main :

```sh
bun run deploy
```

Vérifier que la commande se termine avec succès et signaler toute erreur de mise à jour.

Les écrans de l’application doivent rester à la hauteur de la fenêtre, sans
défilement de la page. Placer les textes explicatifs dans les pages de guides
accessibles via l’aide, jamais sous l’espace de pratique.
