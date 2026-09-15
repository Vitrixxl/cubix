# Arch Linux / AUR

Deux recettes installent le desktop GPUI et son moteur autonome dans `/usr/lib/cubix`,
avec `cubix` dans `/usr/bin`, une entrée de menu et les licences embarquées. Aucune API
locale n'est nécessaire à l'exécution.

| Paquet | Contenu | Mise à jour |
| --- | --- | --- |
| `cubix-bin` | Release GitHub précompilée, vérifiée par SHA-256 | `yay -Syu` |
| `cubix-git` | Compilation locale du dernier `main` (Rust, Bun) | `yay -Syu --devel` |

Les deux se remplacent mutuellement et conservent les données utilisateur.

## Installation

```sh
yay -S cubix-bin
```

Sans yay, `./update.sh` à la racine du dépôt télécharge la dernière release GitHub,
vérifie son empreinte et installe le même paquet avec `pacman -U`.
`./update.sh --download-only` vérifie sans installer.

## Publication automatique de `cubix-bin`

Après chaque validation de `main`, la CI :

1. construit le desktop et l'archive `cubix-linux-x64.tar.gz` ;
2. rend `packaging/aur/cubix-bin/PKGBUILD` depuis `PKGBUILD.in` avec le tag de release,
   la version `<version>.r<commits>.g<sha>` et le SHA-256 de l'archive ;
3. construit le paquet avec ce PKGBUILD, génère `.SRCINFO` et publie le tout dans la
   release GitHub `desktop-<sha>` (paquet, empreinte, archive, `PKGBUILD`, `.SRCINFO`) ;
4. pousse `PKGBUILD` et `.SRCINFO` sur l'AUR si le secret GitHub `AUR_SSH_PRIVATE_KEY`
   contient la clé privée SSH d'un compte AUR mainteneur de `cubix-bin`.

Le PKGBUILD rendu télécharge l'archive de la release depuis GitHub ; `makepkg` la
réutilise sans téléchargement si elle est déjà présente sous le même nom.

### Première publication ou publication manuelle

Créer un compte AUR, y enregistrer une clé SSH publique, puis depuis la racine :

```sh
packaging/aur/publish-bin.sh              # PKGBUILD et .SRCINFO de la dernière release
packaging/aur/publish-bin.sh <dossier>    # fichiers déjà rendus localement
```

Le script clone `ssh://aur@aur.archlinux.org/cubix-bin.git` (créé au premier push),
copie les deux fichiers, commite et pousse. Ajouter ensuite la clé privée dans le secret
`AUR_SSH_PRIVATE_KEY` du dépôt GitHub pour que les releases suivantes se publient seules.

### Validation locale

```sh
cd packaging/aur/cubix-bin
tag=$(gh release view --json tagName -q .tagName)
curl -sSL -o "cubix-linux-x64-$tag.tar.gz" "https://github.com/Vitrixxl/cubix/releases/download/$tag/cubix-linux-x64.tar.gz"
./render.sh "$tag" "0.1.0.r$(git rev-list --count HEAD).g$(git rev-parse --short HEAD)" "$(sha256sum "cubix-linux-x64-$tag.tar.gz" | cut -d' ' -f1)"
makepkg -si
makepkg --printsrcinfo > .SRCINFO
```

## `cubix-git`

Compile le desktop depuis `main` avec Bun 1.4.0 (téléchargé et vérifié) et Rust :

```sh
cd packaging/aur/cubix-git
makepkg -si
makepkg --printsrcinfo > .SRCINFO
```

Publication sur l'AUR avec un compte dont la clé SSH est enregistrée :

```sh
git clone ssh://aur@aur.archlinux.org/cubix-git.git /tmp/cubix-aur
cp packaging/aur/cubix-git/{PKGBUILD,.SRCINFO} /tmp/cubix-aur/
git -C /tmp/cubix-aur add PKGBUILD .SRCINFO
git -C /tmp/cubix-aur commit -m 'Package native Cubix desktop'
git -C /tmp/cubix-aur push
```

Régénérer `.SRCINFO` après chaque modification du PKGBUILD.

Références : [publication AUR](https://wiki.archlinux.org/title/AUR_submission_guidelines),
[paquets VCS](https://wiki.archlinux.org/title/VCS_package_guidelines).
