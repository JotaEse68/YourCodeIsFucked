#!/usr/bin/env node
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import { aiResidueFindings, audit, cleanupDevArtifacts, createCheckpoint, latestCheckpoint, loadConfig, refactorPlan, rollbackToCheckpoint, understand, verificationPlan, verify, writeAuditReport, writeUnfuckReport } from '@ycf/core';

// pnpm forwards a standalone `--` to package scripts on some platforms.
if (process.argv[2] === '--') process.argv.splice(2, 1);

const defaultConfig = `version: 1\n\nmode: balanced\n\nsafety:\n  require_git: true\n  checkpoints: true\n  protect_public_api: true\n  protect_database_schema: true\n\nignore:\n  - node_modules\n  - vendor\n  - dist\n  - build\n  - .git\n`;

type Language = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'ar' | 'zh';
type Audience = 'guided' | 'technical' | 'professional';

async function choose<T extends string>(question: string, choices: Array<{ value: T; label: string }>, fallback: T): Promise<T> {
  if (!input.isTTY) return fallback;
  const readline = createInterface({ input, output });
  const answer = await readline.question(`${question}\n${choices.map((choice, index) => `  ${index + 1}. ${choice.label}`).join('\n')}\n> `);
  readline.close();
  return choices[Number(answer.trim()) - 1]?.value ?? fallback;
}

function validLanguage(value: string | undefined): value is Language {
  return value === 'en' || value === 'es' || value === 'pt' || value === 'fr' || value === 'de' || value === 'it' || value === 'ar' || value === 'zh';
}

function validAudience(value: string | undefined): value is Audience {
  return value === 'guided' || value === 'technical' || value === 'professional';
}

function guidedAdvice(finding: { ruleId: string; evidence: string }, language: Language, audience: Audience): string {
  if (audience !== 'guided') return finding.evidence;
  const advice: Record<Language, Record<string, string>> = {
    es: {
      'debug-statements': 'Se encontró una pausa de depuración. Riesgo bajo: YCF puede eliminarla y verificar el proyecto.',
      'debug-console': 'Se encontró un mensaje de depuración seguro. Riesgo bajo: YCF puede retirarlo y verificar el proyecto.',
      'unused-import': 'Este import nombrado no se usa. Riesgo bajo: YCF conserva la carga del módulo y puede retirar solo el binding.',
      'long-function': 'Esta función es difícil de entender y modificar. No borres nada: divide responsabilidades solo tras revisar sus consumidores.',
      'large-react-component': 'Este componente mezcla demasiada lógica y UI. Revisa qué parte puede extraerse sin cambiar su comportamiento.',
      'react-effect-without-dependencies': 'Este efecto se ejecuta tras cada render. Puede ser intencional: revisa antes de añadir dependencias.',
      'wordpress-dynamic-entrypoint': 'WordPress puede llamar este código dinámicamente. No lo borres ni lo marques como no usado sin revisar el hook o la ruta.',
      'wordpress-rest-route-permission': 'Esta ruta REST puede permitir acceso sin una comprobación de permisos. Revisa autorización antes de publicarla.',
      'wordpress-ajax-nonce-review': 'Esta acción AJAX puede no protegerse contra solicitudes falsas. Revisa el nonce dentro del callback antes de publicarla.',
      'wordpress-ajax-capability-review': 'Esta acción AJAX puede no comprobar permisos del usuario. Revisa capacidades dentro del callback antes de publicarla.',
      'wordpress-unsanitized-input': 'Se usa un dato recibido desde una petición. Comprueba validación y sanitización antes de usarlo o guardarlo.',
      'wordpress-unescaped-output': 'Se muestra una variable sin escape visible. Comprueba el tipo de dato y aplica el escape adecuado antes de mostrarlo.',
      'high-complexity': 'Esta lógica tiene muchas decisiones. Simplifícala por partes y valida cada cambio.',
      'duplicate-code': 'Hay código repetido. Comprueba que hace exactamente lo mismo antes de consolidarlo.',
      'unused-production-dependency': 'Esta dependencia parece no usarse estáticamente. Puede cargarse en tiempo de ejecución: no la elimines sin comprobarlo.'
    },
    en: {
      'debug-statements': 'A debugger pause was found. Low risk: YCF can remove it and verify the project.',
      'debug-console': 'A safe debug message was found. Low risk: YCF can remove it and verify the project.',
      'unused-import': 'This named import is unused. Low risk: YCF keeps the module load and can remove only the binding.',
      'long-function': 'This function is hard to understand and change. Review its consumers before splitting responsibilities.',
      'large-react-component': 'This component mixes too much logic and UI. Review what can be extracted without changing behavior.',
      'react-effect-without-dependencies': 'This effect runs after every render. It may be intentional; review it before adding dependencies.',
      'wordpress-dynamic-entrypoint': 'WordPress may call this code dynamically. Do not delete it or mark it unused before reviewing the hook or route.',
      'wordpress-rest-route-permission': 'This REST route may allow access without a permission check. Review authorization before release.',
      'wordpress-ajax-nonce-review': 'This AJAX action may lack protection against forged requests. Review nonce verification inside its callback before release.',
      'wordpress-ajax-capability-review': 'This AJAX action may not check user permissions. Review capabilities inside its callback before release.',
      'wordpress-unsanitized-input': 'Request input is used here. Review validation and sanitization before using or storing it.',
      'wordpress-unescaped-output': 'A variable is rendered without visible escaping. Review the data context and escape it before rendering.',
      'high-complexity': 'This logic has many decisions. Simplify it in small validated steps.',
      'duplicate-code': 'Repeated code was found. Confirm identical behavior before consolidating it.',
      'unused-production-dependency': 'This dependency appears unused statically. It may load at runtime; verify before removal.'
    },
    fr: {
      'debug-statements': 'Une pause de débogage a été détectée. Risque faible : YCF peut la supprimer et vérifier le projet.',
      'debug-console': 'Un message de débogage sûr a été détecté. Risque faible : YCF peut le supprimer et vérifier le projet.',
      'unused-import': 'Cet import nommé n’est pas utilisé. Risque faible : YCF conserve le chargement du module et retire seulement le binding.',
      'long-function': 'Cette fonction est difficile à comprendre et à modifier. Vérifiez ses consommateurs avant de la découper.',
      'large-react-component': 'Ce composant mélange trop de logique et d’interface. Vérifiez ce qui peut être extrait sans changer le comportement.',
      'react-effect-without-dependencies': 'Cet effet est exécuté après chaque rendu. Cela peut être intentionnel ; vérifiez avant d’ajouter des dépendances.',
      'wordpress-dynamic-entrypoint': 'WordPress peut appeler ce code dynamiquement. Ne le supprimez pas et ne le marquez pas comme inutilisé avant de vérifier le hook ou la route.',
      'wordpress-rest-route-permission': 'Cette route REST peut autoriser un accès sans contrôle de permission. Vérifiez l’autorisation avant la publication.',
      'wordpress-ajax-nonce-review': 'Cette action AJAX peut manquer de protection contre les requêtes forgées. Vérifiez le nonce dans son callback avant publication.',
      'wordpress-ajax-capability-review': 'Cette action AJAX peut ne pas vérifier les permissions de l’utilisateur. Vérifiez les capacités dans son callback avant publication.',
      'wordpress-unsanitized-input': 'Une donnée de requête est utilisée ici. Vérifiez sa validation et sa sanitisation avant de l’utiliser ou de la stocker.',
      'wordpress-unescaped-output': 'Une variable est affichée sans échappement visible. Vérifiez le contexte des données et échappez-la avant affichage.',
      'high-complexity': 'Cette logique contient beaucoup de décisions. Simplifiez-la par petites étapes validées.',
      'duplicate-code': 'Du code répété a été trouvé. Confirmez le même comportement avant de le consolider.',
      'unused-production-dependency': 'Cette dépendance semble inutilisée statiquement. Elle peut être chargée à l’exécution ; vérifiez avant de la supprimer.'
    },
    pt: {},
    de: {},
    it: {},
    ar: {},
    zh: {}
  };
  const fallback: Record<Language, string> = {
    en: 'YCF found an item to review. Read the evidence, assess the risk, and use the suggested safe command only when you understand the change.',
    es: 'YCF encontró un punto para revisar. Lee la evidencia, valora el riesgo y usa un comando seguro solo cuando entiendas el cambio.',
    pt: 'O YCF encontrou um ponto para revisão. Leia a evidência, avalie o risco e use um comando seguro apenas quando entender a alteração.',
    fr: 'YCF a trouvé un élément à examiner. Lisez les preuves, évaluez le risque et utilisez une commande sûre seulement si vous comprenez la modification.',
    de: 'YCF hat einen Prüfpunk gefunden. Lies die Hinweise, bewerte das Risiko und nutze einen sicheren Befehl nur, wenn du die Änderung verstehst.',
    it: 'YCF ha trovato un elemento da verificare. Leggi le prove, valuta il rischio e usa un comando sicuro solo quando comprendi la modifica.',
    ar: 'عثر YCF على نقطة تحتاج إلى مراجعة. اقرأ الدليل، وقيّم المخاطر، واستخدم أمراً آمناً فقط عندما تفهم التغيير.',
    zh: 'YCF 发现了一项需要检查的问题。请阅读证据、评估风险，并且只在理解变更后使用安全命令。'
  };
  return advice[language][finding.ruleId] ?? fallback[language];
}

const program = new Command()
  .name('ycf')
  .description('YCF — YourCodeIsFucked. Deterministic codebase quality tooling.')
  .version('0.1.0-dev');

program.command('init [target]').description('Create YCF configuration without overwriting existing files.').option('--language <language>', 'Response language: en, es, pt, fr, de, it, ar, or zh.').option('--audience <audience>', 'Explanation level: guided, technical, or professional.').action(async (target = '.', options) => {
  const directory = resolve(target);
  const configPath = join(directory, 'ycf.config.yml');
  mkdirSync(join(directory, '.ycf'), { recursive: true });
  if (existsSync(configPath)) {
    console.log(`YCF is already initialized: ${configPath}`);
    return;
  }
  const language = validLanguage(options.language) ? options.language : await choose('Choose a response language / Elige idioma / Choisissez une langue', [
    { value: 'en', label: 'English (default)' }, { value: 'es', label: 'Español' }, { value: 'pt', label: 'Português' }, { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' }, { value: 'it', label: 'Italiano' }, { value: 'ar', label: 'العربية' }, { value: 'zh', label: '中文' }
  ], 'en');
  const audience = validAudience(options.audience) ? options.audience : await choose('Choose explanation level / Elige nivel / Choisissez le niveau', [
    { value: 'guided', label: 'Guided — clear explanations and next steps' }, { value: 'technical', label: 'Technical — concise engineering detail' }, { value: 'professional', label: 'Professional — formal reporting and CI' }
  ], 'guided');
  const configWithLimits = defaultConfig.replace(
    'mode: balanced\n\n',
    `mode: balanced\nlanguage: ${language}\naudience: ${audience}\n\nrefactor:\n  max_function_lines: 80\n  max_file_lines: 700\n  max_complexity: 15\n\n`
  );
  writeFileSync(configPath, configWithLimits, 'utf8');
  console.log(`Initialized YCF: ${configPath} (${language}, ${audience})`);
});

program.command('audit [target]').description('Audit a repository without modifying it.').option('--json', 'Emit the complete JSON report.').option('--language <language>', 'Response language: en, es, pt, fr, de, it, ar, or zh.').option('--audience <audience>', 'Explanation level: guided, technical, or professional.').action((target = '.', options) => {
  const report = audit(target);
  const config = loadConfig(target);
  const language = validLanguage(options.language) ? options.language : config.language;
  const audience = validAudience(options.audience) ? options.audience : config.audience;
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('YCF — YourCodeIsFucked');
  console.log(`Target: ${report.target}`);
  console.log(`Stacks: ${report.stacks.join(', ') || 'unknown'}`);
  console.log(`Source files: ${report.sourceFiles}`);
  console.log(`Git: ${report.git.detected ? 'detected' : 'not detected'}`);
  console.log(`Findings: ${report.findings.length}`);
  for (const finding of report.findings) console.log(`[${finding.severity}] ${finding.file}:${finding.lines.join(', ')} — ${guidedAdvice(finding, language, audience)}`);
  console.log(`FUCKED SCORE: ${report.score.fucked}%`);
  console.log(`HEALTH SCORE: ${report.score.health}/100`);
  console.log('Audit mode is read-only.');
});

program.command('understand [target]').description('Map repository modules and local dependencies into .ycf reports.').option('--json', 'Emit the complete JSON report.').action((target = '.', options) => {
  const report = understand(target);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('YCF — repository understood.');
    console.log(`Source files: ${report.sourceFiles}`);
    console.log(`Modules: ${report.modules.length}`);
    console.log(`Local dependency edges: ${report.dependencies.length}`);
    console.log(`Reports: ${join(report.target, '.ycf')}`);
  }
});

program.command('map [target]').description('Generate and summarize the repository architecture graph.').option('--json', 'Emit the graph as JSON.').action((target = '.', options) => {
  const report = understand(target);
  if (options.json) { console.log(JSON.stringify(report.graph, null, 2)); return; }
  const entryPoints = report.graph.nodes.filter((node) => node.entryPoint);
  console.log('YCF — architecture map');
  console.log(`Modules: ${report.graph.nodes.length}`);
  console.log(`Connections: ${report.graph.edges.length}`);
  console.log(`Entry-point candidates: ${entryPoints.length ? entryPoints.map((node) => node.file).join(', ') : 'none found'}`);
  console.log(`Dependency cycles: ${report.graph.cycles.length}`);
  console.log(`Hotspots: ${report.hotspots.length}`);
  console.log(`Exact duplicate groups: ${report.duplicates.length}`);
  console.log(`Full map: ${join(report.target, '.ycf', 'graph.json')}`);
});

program.command('report [target]').description('Persist the current read-only audit as JSON and Markdown in .ycf.').action((target = '.') => {
  const paths = writeAuditReport(target);
  console.log('YCF — audit report written.');
  console.log(`JSON: ${paths.jsonPath}`);
  console.log(`Markdown: ${paths.markdownPath}`);
});

program.command('ai-residue [target]').description('Find AI/dev residue candidates without modifying code or attribution.').option('--json', 'Emit findings as JSON.').action((target = '.', options) => {
  const findings = aiResidueFindings(target);
  if (options.json) { console.log(JSON.stringify(findings, null, 2)); return; }
  console.log(`AI/dev residue candidates: ${findings.length}`);
  for (const finding of findings) console.log(`[${finding.risk}] ${finding.file}${finding.lines.length ? `:${finding.lines.join(',')}` : ''} — ${finding.evidence}`);
  console.log('No code, licenses, copyright notices, or attribution were modified.');
});

program.command('cleanup [target]').description('Remove parser-confirmed debug artifacts with Git safety and verification.').option('--dry-run', 'Show the planned cleanup without writing files.').option('--yes', 'Confirm the source-code changes.').action((target = '.', options) => {
  const candidates = audit(target).findings.filter((finding) => finding.ruleId === 'debug-statements' || finding.ruleId === 'debug-console' || finding.ruleId === 'unused-import');
  const planned = candidates.reduce((total, finding) => total + finding.lines.length, 0);
  if (options.dryRun || !options.yes) {
    console.log(`Planned cleanup: ${planned} parser-confirmed safe artifact(s).`);
    console.log('No files changed. Re-run with --yes to create a checkpoint, apply the cleanup, and verify it.');
    return;
  }
  if (!planned) { console.log('No parser-confirmed debugger statements found.'); return; }
  const checkpoint = createCheckpoint(target);
  const cleanup = cleanupDevArtifacts(target);
  const verification = verify(target);
  if (!verification.passed) {
    rollbackToCheckpoint(target, checkpoint);
    console.error(`Verification failed. Restored checkpoint ${checkpoint.commit}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Cleanup complete: removed ${cleanup.removedDebugStatements} debugger statement(s), ${cleanup.removedDebugConsoleCalls} literal debug console call(s), and ${cleanup.removedUnusedImports} unused named import(s) in ${cleanup.changedFiles.length} file(s).`);
  console.log(`Checkpoint retained: ${checkpoint.ref}`);
  console.log('Verification passed.');
});

program.command('unfuck [target]').description('Run YCF’s current safe pipeline: audit, checkpoint, cleanup, verify and report.').option('--dry-run', 'Show the safe changes YCF would make.').option('--yes', 'Confirm source-code changes after reviewing the plan.').action((target = '.', options) => {
  const startedAt = new Date().toISOString();
  const before = audit(target);
  const planned = before.findings.filter((finding) => finding.ruleId === 'debug-statements' || finding.ruleId === 'debug-console' || finding.ruleId === 'unused-import').reduce((total, finding) => total + finding.lines.length, 0);
  if (options.dryRun || !options.yes) {
    console.log('YCF unfuck plan');
    console.log(`FUCKED SCORE: ${before.score.fucked}%`);
    console.log(`Safe changes available: ${planned} parser-confirmed safe artifact(s).`);
    console.log('No files changed. Re-run with --yes to execute the safe pipeline.');
    return;
  }
  if (!planned) {
    understand(target);
    const report = { target: before.target, startedAt, completedAt: new Date().toISOString(), status: 'no-changes' as const, before, after: before };
    const paths = writeUnfuckReport(target, report);
    console.log(`No allowlisted safe changes found. Report: ${paths.markdownPath}`);
    return;
  }
  const checkpoint = createCheckpoint(target);
  try {
    understand(target);
    const cleanup = cleanupDevArtifacts(target);
    const verification = verify(target);
    if (!verification.passed) {
      rollbackToCheckpoint(target, checkpoint);
      const after = audit(target);
      const paths = writeUnfuckReport(target, { target: before.target, startedAt, completedAt: new Date().toISOString(), status: 'rolled-back', before, after, checkpoint, cleanup, verification });
      console.error(`Verification failed; restored ${checkpoint.commit}. Report: ${paths.markdownPath}`);
      process.exitCode = 1;
      return;
    }
    const after = audit(target);
    const paths = writeUnfuckReport(target, { target: before.target, startedAt, completedAt: new Date().toISOString(), status: 'verified', before, after, checkpoint, cleanup, verification });
    console.log(`YCF unfuck complete: ${before.score.fucked}% → ${after.score.fucked}%.`);
    console.log(`Removed ${cleanup.removedDebugStatements} debugger statement(s), ${cleanup.removedDebugConsoleCalls} literal debug console call(s), and ${cleanup.removedUnusedImports} unused named import(s). Report: ${paths.markdownPath}`);
  } catch (error) {
    rollbackToCheckpoint(target, checkpoint);
    throw error;
  }
});

program.command('refactor [target]').description('Generate a supervised refactor plan without changing source code.').option('--dry-run', 'Explicitly confirm planning-only mode.').option('--json', 'Emit the full plan as JSON.').action((target = '.', options) => {
  const result = refactorPlan(target);
  if (options.json) { console.log(JSON.stringify(result.plan, null, 2)); return; }
  console.log('YCF — supervised refactor plan');
  console.log(`Recommendations: ${result.plan.summary.total}`);
  console.log(`Safe refactors to review: ${result.plan.summary.safeRefactors}`);
  console.log(`Architectural reviews: ${result.plan.summary.architecturalReviews}`);
  for (const recommendation of result.plan.recommendations) console.log(`[${recommendation.risk}] ${recommendation.file}:${recommendation.lines.join(',')} — ${recommendation.title}`);
  console.log(`No source code changed. Plan: ${result.markdownPath}`);
});

program.command('verify [target]').description('Run available lint, typecheck, test and build scripts.').option('--dry-run', 'Show the commands without running them.').action((target = '.', options) => {
  if (options.dryRun) {
    for (const check of verificationPlan(target)) console.log(`${check.name}: ${check.output ?? check.command.join(' ')}`);
    return;
  }
  const report = verify(target);
  for (const check of report.checks) console.log(`${check.status === 'passed' ? '✓' : check.status === 'failed' ? '✗' : '—'} ${check.name}${check.output ? ` — ${check.output.split(/\r?\n/).at(-1)}` : ''}`);
  if (!report.passed) process.exitCode = 1;
});

program.command('checkpoint [target]').description('Create a YCF Git checkpoint from a clean worktree.').action((target = '.') => {
  const checkpoint = createCheckpoint(target);
  console.log(`Checkpoint created: ${checkpoint.ref} -> ${checkpoint.commit}`);
});

program.command('rollback [target]').description('Reset a clean worktree to the latest YCF checkpoint.').option('--yes', 'Confirm the destructive Git reset.').action((target = '.', options) => {
  if (!options.yes) throw new Error('Rollback performs git reset --hard. Re-run with --yes after reviewing your Git history.');
  const checkpoint = latestCheckpoint(target);
  if (!checkpoint) throw new Error('No YCF checkpoint found.');
  rollbackToCheckpoint(target, checkpoint);
  console.log(`Rolled back to ${checkpoint.commit} (${checkpoint.ref}).`);
});

program.parse();
