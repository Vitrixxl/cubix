# Arch Linux / AUR

Le paquet `cubix-git` construit uniquement le desktop GPUI et son moteur autonome.
Il installe `cubix` dans `/usr/bin`, les fichiers dans `/usr/lib/cubix`, une entrée
Cubix dans le menu et les licences embarquées. Bun et Rust servent à la compilation ;
il n'est pas nécessaire de lancer une API locale. Le build télécharge Bun 1.4.0
depuis sa release officielle avec vérification SHA-256 : les anciennes versions
de `bun-bin` dans l'AUR ne lisent pas le format du lockfile du projet.

## Installation

Après publication de ce dossier sur l'AUR et des sources desktop sur `main` :

```sh
yay -S cubix-git
```

Un PKGBUILD dans GitHub ne suffit pas à rendre le paquet trouvable par yay.
Les binaires GitHub permettent déjà l'installation sans passer par l'AUR.

Pour mettre à jour le paquet installé localement, depuis la racine du dépôt :

```sh
./update.sh
```

Ce script télécharge le dernier paquet **précompilé** depuis les releases GitHub,
vérifie son empreinte SHA-256, puis l'installe avec `yay -U` (ou `pacman -U`).
Il ne nécessite ni Rust, ni Cargo, ni Bun, ni compte AUR. Le paquet `cubix-bin`
remplace `cubix-git` ; les données utilisateur sont conservées.
Fermer et relancer Cubix après l'installation.

`./update.sh --download-only` télécharge et vérifie le paquet sans l'installer.
Les binaires sont publiés automatiquement après les tests réussis de `main`.
Une modification locale ou une compilation CI en cours ne figure donc pas encore
dans la dernière release. Une erreur de téléchargement ou d'empreinte arrête
l'installation et laisse la version existante intacte.

Pour compiler volontairement depuis les sources, utiliser la recette
`packaging/aur/cubix-git/PKGBUILD` décrite ci-dessous.

## Validation et publication

Sur Arch avec `base-devel` et les dépendances de construction installés :

```sh
cd packaging/aur/cubix-git
makepkg -si
makepkg --printsrcinfo > .SRCINFO
```

`makepkg` récupère `main` depuis GitHub ; les changements doivent donc y être
publiés avant cette validation. Le contrôle du paquet lance le moteur compilé
sur une base temporaire hors ligne et valide l'entrée de menu.
Un pilote Vulkan est nécessaire pour le rendu de l'interface.

Pour publier, utiliser un compte AUR avec une clé SSH enregistrée :

```sh
git clone ssh://aur@aur.archlinux.org/cubix-git.git /tmp/cubix-aur
cp packaging/aur/cubix-git/{PKGBUILD,.SRCINFO} /tmp/cubix-aur/
git -C /tmp/cubix-aur add PKGBUILD .SRCINFO
git -C /tmp/cubix-aur commit -m 'Package native Cubix desktop'
git -C /tmp/cubix-aur push
```

Régénérer `.SRCINFO` après chaque modification du PKGBUILD. Pour une mise à jour
VCS, `yay -S cubix-git` reconstruit le dernier `main` ; `yay -Syu --devel` peut
également détecter les nouveaux commits.

Références : [publication AUR](https://wiki.archlinux.org/title/AUR_submission_guidelines),
[paquets VCS](https://wiki.archlinux.org/title/VCS_package_guidelines).
