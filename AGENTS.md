# Consignes pour les agents

Après chaque commit sur `main`, pousser le commit, mettre à jour le serveur et
publier l'APK avec la commande suivante (elle enchaîne `git push`,
`ssh vitrix@82.67.236.74 pihost update cubix`, la compilation de l'APK ARM64 en
local puis son envoi à l'API) :

```sh
bun run deploy
```

Vérifier que la commande se termine avec succès et signaler toute erreur de mise à jour.

Les écrans de l’application doivent rester à la hauteur de la fenêtre, sans
défilement de la page. Placer les textes explicatifs dans les pages de guides
accessibles via l’aide, jamais sous l’espace de pratique.
