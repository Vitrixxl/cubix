# Desktop GPUI

Le desktop est désormais le client PC maintenu. L'ancienne interface web, sa PWA
et les outils de comparaison avec le navigateur ont été retirés.

Les fonctionnalités natives existantes sont conservées : chronomètre monotone,
catalogue, entraînement, comptes, profils, amis, messages, thèmes et guides.
Le moteur utilise `src/client` avec Android pour les données et la synchronisation.
Les contrôles de test natifs restent derrière la fonctionnalité Cargo `reference`.

Seul Linux est validé. La suppression du web ne constitue pas une validation
exhaustive des interactions du desktop. Les anciens résultats et captures restent
locaux dans `artifacts/gpui` ; ils ne font pas partie du paquet.

Voir [les commandes de construction et de test](../../desktop/README.md).
