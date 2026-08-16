# YCF — YourCodeIsFucked

> **Votre code est foutu. On va le remettre d'aplomb.**
>
> **Your code is fucked. Let's unfuck it.**

<details>
<summary>Lire dans une autre langue</summary>

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)
</details>

## Utilisez ce que vous voulez.

Claude Code · Codex · Cursor · Copilot · Gemini · Lovable · Bolt · Vos propres mains

```text
               construire vite
                     ↓
          YCF — la couche qualité
                     ↓
              livrer du code propre
```

**Nous ne détectons pas le code IA. Nous détectons le mauvais code.**

YCF est une CLI gratuite et open source pour comprendre un codebase, trouver des problèmes d'ingénierie mesurables, nettoyer des résidus confirmés en sécurité, planifier des améliorations et vérifier que rien n'a cassé. Pour le vibe coder, le développeur assisté par IA et l'équipe qui a besoin de quality gates.

Le vibe coding est amusant. Nettoyer après l'est beaucoup moins.

## Commencez ici

```bash
npx your-code-is-fucked audit
npm install -g your-code-is-fucked
cd mon-projet
ycf audit
ycf map
ycf unfuck --dry-run
```

N'utilisez `--yes` qu'après avoir relu le plan. YCF crée un checkpoint Git, vérifie le résultat et effectue un rollback si la vérification échoue.

## Ce que YCF fait aujourd'hui

- `ycf audit` audite sans modifier le code et explique le risque selon votre langue et votre niveau.
- `ycf map` génère une carte d'architecture avec points d'entrée et connexions locales.
- `ycf ai-residue` cherche les résidus de développement et d'IA sans effacer les attributions.
- `ycf cleanup --yes` retire les résidus de débogage confirmés et certains imports inutilisés, avec la sécurité Git.
- `ycf unfuck --dry-run` montre le pipeline actuel: audit, checkpoint, nettoyage, vérification et rapport.
- `ycf refactor` produit un plan supervisé au lieu de réécrire votre architecture en douce.
- `ycf verify` et `ycf release` exécutent les contrôles et génèrent le rapport de préparation.

YCF fournit des diagnostics déterministes pour JavaScript, TypeScript, React, PHP et WordPress. Hooks, filters, shortcodes, REST, AJAX, cron et WooCommerce ne sont pas déclarés morts juste parce qu'ils n'ont pas d'appel direct.

## Les démons du codebase

`DeadCode`, `CopyPaste`, `GodComponent`, `MysteryHelper`, `FinalFinalV3`, `TODOFromHell` et `DependencyNobodyUses`: des noms amusants pour des problèmes qui exigent des preuves. Chaque résultat doit indiquer le fichier, le risque, l'action sûre et la décision humaine encore nécessaire.

> « Ça marche » n'est pas de la documentation. La production n'est pas un framework de tests.

## De l'ingénierie sérieuse sous la blague

- `ycf audit` ne modifie jamais le code source.
- Le nettoyage sûr exige un worktree Git propre, un checkpoint et `--yes` explicite.
- Authentification, paiements, API publiques, schémas de données et callbacks dynamiques ne changent jamais automatiquement.
- Licences, copyright et attributions obligatoires sont protégés.
- Un refactor reste un plan supervisé jusqu'à ce qu'il existe assez de preuves pour le faire sans risque.

## Pourquoi j'ai créé ceci

J'ai utilisé l'IA pour construire plus vite. Et cela a marché. Pendant un temps.

Puis j'ai ouvert des projets remplis de helpers dupliqués, de correctifs « temporaires » vieux de plusieurs mois, de dossiers `final-final-v3` et de composants si énormes qu'ils commençaient à réclamer une convention collective.

Tout fonctionnait. Plus ou moins. Mais expliquer, revoir ou livrer cela comme un travail professionnel était une autre histoire.

Le pire ? C'était mon propre bazar.

Je voulais garder la vitesse sans nettoyer secrètement la scène de crime avant que quelqu'un ne voie le code. J'ai donc créé YCF: non pour prétendre qu'un humain a écrit le code, mais pour le rendre clair, maintenable, vérifiable et prêt à livrer.

## D'abord la CLI. Ensuite les Skills et les agents.

Le cœur de YCF est déterministe: il cartographie, mesure, protège avec Git, écrit des rapports et vérifie. Il est conçu pour travailler avec Codex, Claude Code et d'autres agents. Les Skills, une analyse d'impact plus riche et un cockpit visuel local sont sur la roadmap; ils ne sont pas présentés ici comme déjà livrés.

`ycf init` permet de choisir langue et niveau d'explication. L'anglais est la langue par défaut; espagnol, portugais, français, allemand, italien, arabe et chinois sont disponibles.

```bash
ycf audit --language fr --audience guided
ycf audit --audience professional
```

## Contribution et sécurité

YCF est open source sous Apache-2.0. Consultez [CONTRIBUTING.md](CONTRIBUTING.md) et [SECURITY.md](SECURITY.md).

Créé par [Jota Santos](https://www.jsantos.pro/).
