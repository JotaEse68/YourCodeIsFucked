# YCF — YourCodeIsFucked

> **Seu código está ferrado. Vamos consertá-lo.**
>
> **Your code is fucked. Let's unfuck it.**

<details>
<summary>Ler em outro idioma</summary>

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)
</details>

## Use o que quiser.

Claude Code · Codex · Cursor · Copilot · Gemini · Lovable · Bolt · Suas próprias mãos

```text
               construa rápido
                     ↓
          YCF — a camada de qualidade
                     ↓
              entregue código limpo
```

**Não detectamos código de IA. Detectamos código ruim.**

YCF é uma CLI gratuita e open source para entender um codebase, encontrar problemas mensuráveis, limpar resíduos confirmados com segurança, planejar melhorias e verificar que nada quebrou. Serve para quem faz vibe coding, para desenvolvedores assistidos por IA e para equipes que precisam de quality gates.

Vibe coding é divertido. Limpar depois não é.

## Comece aqui

```bash
npx ycf-unfuck audit
npm install -g ycf-unfuck
cd meu-projeto
ycf audit
ycf map
ycf unfuck --dry-run
```

Use `--yes` somente depois de revisar o plano. YCF cria um checkpoint Git, verifica o resultado e faz rollback se a verificação falhar.

## O que o YCF faz hoje

- `ycf audit`: audita sem alterar código e explica risco no seu idioma e nível.
- `ycf map`: gera um mapa de arquitetura com pontos de entrada e conexões locais.
- `ycf ai-residue`: procura resíduos de desenvolvimento e IA sem apagar atribuições.
- `ycf cleanup --yes`: remove resíduos de depuração confirmados e alguns imports não usados, com segurança Git.
- `ycf unfuck --dry-run`: mostra o pipeline seguro atual: auditoria, checkpoint, limpeza, verificação e relatório.
- `ycf refactor`: gera um plano supervisionado; não reescreve sua arquitetura escondido.
- `ycf verify` e `ycf release`: executam verificações e produzem um relatório de prontidão.

Há diagnósticos deterministas para JavaScript, TypeScript, React, PHP e WordPress. Hooks, filters, shortcodes, REST, AJAX, cron e WooCommerce não são tratados como “código morto” só porque não têm chamada direta.

## Os demônios do codebase

`DeadCode`, `CopyPaste`, `GodComponent`, `MysteryHelper`, `FinalFinalV3`, `TODOFromHell` e `DependencyNobodyUses`: nomes divertidos para problemas que exigem evidência real. Cada achado deve explicar arquivo, risco, ação segura e o que ainda requer decisão humana.

> “Funciona” não é documentação. Produção não é framework de testes.

## Engenharia séria por baixo da piada

- `ycf audit` nunca altera código-fonte.
- Limpeza segura exige worktree Git limpo, checkpoint e `--yes` explícito.
- Autenticação, pagamentos, APIs públicas, esquemas de banco e callbacks dinâmicos não mudam automaticamente.
- Licenças, copyright e atribuições obrigatórias são protegidos.
- Um refactor continua sendo um plano supervisionado até haver evidência para fazê-lo com segurança.

## Por que criei isto

Usei IA para construir mais rápido. E funcionou. Por um tempo.

Depois abria projetos com helpers duplicados, patches “temporários” de meses atrás, pastas `final-final-v3` e componentes tão grandes que já queriam sindicato.

Tudo funcionava. Mais ou menos. Explicar, revisar ou entregar aquilo como algo profissional era outra história.

A parte irritante? Era a minha própria bagunça.

Eu queria manter a velocidade sem limpar a cena do crime em segredo antes que alguém visse o código. Por isso criei o YCF: não para fingir que o código foi escrito por humano, mas para deixá-lo claro, sustentável, verificável e pronto para entregar.

## CLI primeiro. Skills e agentes depois.

O núcleo do YCF é determinista: mapeia, mede, protege com Git, escreve relatórios e verifica. Ele foi projetado para trabalhar ao lado de Codex, Claude Code e outros agentes. Skills, análise de impacto e um cockpit visual local fazem parte do roadmap, não são promessas de funcionalidades já entregues.

`ycf init` permite escolher idioma e nível de explicação. Inglês é o padrão; português, espanhol, francês, alemão, italiano, árabe e chinês também estão disponíveis.

```bash
ycf audit --language pt --audience guided
ycf audit --audience professional
```

## Contribuição e segurança

YCF é open source sob Apache-2.0. Veja [CONTRIBUTING.md](CONTRIBUTING.md) e [SECURITY.md](SECURITY.md).

Criado por [Jota Santos](https://www.jsantos.pro/).
