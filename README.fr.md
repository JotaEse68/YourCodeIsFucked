# YCF — YourCodeIsFucked

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · **Français** · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)

YCF est un outil open source en ligne de commande pour comprendre, auditer et améliorer un projet de code en sécurité. Il ne cherche pas qui a écrit le code : il trouve des problèmes mesurables et explique la suite.

## Commencer ici

```bash
npm install -g your-code-is-fucked
cd mon-projet
ycf init
ycf audit
ycf unfuck --dry-run
```

Dans `ycf init`, choisissez la langue et le niveau d’explication. Pour un langage clair, choisissez `Français` et `guided`.

## Lire un résultat

- **AUTO** : YCF peut appliquer le changement avec checkpoint et vérification.
- **SAFE REFACTOR** : une amélioration est possible ; vérifiez l’intention avant de modifier.
- **REPORT-ONLY** : YCF explique le problème sans rien modifier.
- **ARCHITECTURAL** : cela touche une zone sensible et nécessite une décision humaine.

Utilisez `ycf cleanup --dry-run` pour voir les changements sûrs. Lancez `ycf cleanup --yes` seulement après avoir lu le plan ; YCF crée un checkpoint Git et restaure le projet si la vérification échoue.

## Protections et état

YCF ne modifie jamais automatiquement l’authentification, les paiements, les API publiques, les schémas de base de données, les intégrations externes ou les callbacks dynamiques. La version actuelle analyse JS/TS/React et PHP/WordPress, propose des nettoyages sûrs et vérifie la préparation à la publication avec `ycf release`.
