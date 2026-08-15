# YCF — YourCodeIsFucked

[English](README.md) · [Español](README.es.md) · **Português** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)

YCF é uma ferramenta open source de linha de comando para entender, auditar e melhorar projetos de código com segurança. Não tenta descobrir quem escreveu o código: encontra problemas mensuráveis e explica o próximo passo.

## Comece aqui

```bash
npm install -g your-code-is-fucked
cd meu-projeto
ycf init
ycf audit
ycf unfuck --dry-run
```

No `ycf init`, escolha o idioma e o nível de explicação. Para linguagem simples, selecione `Português` e `guided`.

## Como entender um resultado

- **AUTO**: YCF pode aplicar a alteração com checkpoint e verificação.
- **SAFE REFACTOR**: existe uma melhoria possível; revise a intenção antes de alterar.
- **REPORT-ONLY**: YCF explica o problema e não altera nada.
- **ARCHITECTURAL**: afeta áreas sensíveis e exige decisão humana.

Use `ycf cleanup --dry-run` para ver alterações seguras. Use `ycf cleanup --yes` apenas após revisar o plano; YCF cria um checkpoint Git e reverte se a verificação falhar.

## Proteções

YCF não modifica automaticamente autenticação, pagamentos, APIs públicas, esquemas de banco de dados, integrações externas ou callbacks dinâmicos. `ycf audit` nunca altera o código.

## Estado atual

Inclui diagnósticos JS/TS/React e PHP/WordPress, limpeza segura, relatórios, checkpoints, validação e verificação de preparação para publicação com `ycf release`. Refactors maiores continuam como planos supervisionados.
