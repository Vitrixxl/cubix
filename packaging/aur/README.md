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
Tant que la publication AUR n'est pas effectuée, construire depuis les sources
avec `bun run build:desktop` (voir le README desktop).

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
