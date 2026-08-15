#!/usr/bin/env node
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import { aiResidueFindings, audit, cleanupDevArtifacts, createCheckpoint, dependencyAudit, dependencyAuditPlan, latestCheckpoint, loadConfig, refactorPlan, releaseCheckLabel, releaseHeading, releaseReadiness, releaseReportLabel, rollbackToCheckpoint, understand, verificationPlan, verify, writeAuditReport, writeDependencyAuditReport, writeReleaseReport, writeUnfuckReport } from '@ycf/core';

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
  if (finding.ruleId === 'wordpress-rest-persistence-review') {
    const sanitizer = /Recommended after confirming the expected type: ([^.]+),/.exec(finding.evidence)?.[1];
    if (sanitizer) {
      const messages: Record<Language, string> = {
        es: `Este dato REST se guarda sin sanitización visible. YCF sugiere \`${sanitizer}\` por el nombre del dato; confirma primero que el tipo esperado sea correcto.`,
        en: `This REST value is stored without visible sanitization. YCF suggests \`${sanitizer}\` from the value name; first confirm that the expected type is correct.`,
        pt: `Este valor REST é guardado sem sanitização visível. O YCF sugere \`${sanitizer}\` pelo nome do valor; primeiro confirme o tipo esperado.`,
        fr: `Cette valeur REST est stockée sans sanitisation visible. YCF suggère \`${sanitizer}\` d’après son nom ; confirmez d’abord le type attendu.`,
        de: `Dieser REST-Wert wird ohne sichtbare Bereinigung gespeichert. YCF empfiehlt anhand des Namens \`${sanitizer}\`; bestätige zuerst den erwarteten Typ.`,
        it: `Questo valore REST viene salvato senza sanitizzazione visibile. YCF suggerisce \`${sanitizer}\` in base al nome; conferma prima il tipo previsto.`,
        ar: `يُحفظ مقدار REST هذا دون تعقيم ظاهر. يقترح YCF \`${sanitizer}\` بناءً على الاسم؛ أكّد أولاً النوع المتوقع.`,
        zh: `此 REST 值在没有可见清理的情况下被保存。YCF 根据名称建议使用 \`${sanitizer}\`；请先确认预期的数据类型。`
      };
      return messages[language];
    }
  }
  const advice: Record<Language, Record<string, string>> = {
    es: {
      'debug-statements': 'Se encontró una pausa de depuración. Riesgo bajo: YCF puede eliminarla y verificar el proyecto.',
      'debug-console': 'Se encontró un mensaje de depuración seguro. Riesgo bajo: YCF puede retirarlo y verificar el proyecto.',
      'unused-import': 'Este import nombrado no se usa. Riesgo bajo: YCF conserva la carga del módulo y puede retirar solo el binding.',
      'sensitive-repository-file': 'Hay un archivo con nombre de secreto, clave, configuración real o backup. YCF no leyó su contenido: revisa que no se suba ni se despliegue públicamente.',
      'sensitive-repository-file-tracked': 'Este archivo sensible ya está seguido por Git. Puede acabar en el repositorio: retíralo de forma segura, rota credenciales y usa secretos de despliegue.',
      'sensitive-repository-file-protected': 'Este archivo sensible local está ignorado por Git. Mantén la regla y confirma que no esté seguido en otra rama o incluido en un artefacto de publicación.',
      'long-function': 'Esta función es difícil de entender y modificar. No borres nada: divide responsabilidades solo tras revisar sus consumidores.',
      'large-react-component': 'Este componente mezcla demasiada lógica y UI. Revisa qué parte puede extraerse sin cambiar su comportamiento.',
      'react-effect-without-dependencies': 'Este efecto se ejecuta tras cada render. Puede ser intencional: revisa antes de añadir dependencias.',
      'wordpress-dynamic-entrypoint': 'WordPress puede llamar este código dinámicamente. No lo borres ni lo marques como no usado sin revisar el hook o la ruta.',
      'wordpress-dynamic-callback-review': 'Este callback WordPress se construye dinámicamente o es un closure. YCF no puede demostrar su seguridad: revísalo antes de publicar.',
      'wordpress-production-debug-config': 'La depuración WordPress está activa en la configuración. En producción puede mostrar errores o rutas internas: desactiva la salida visible antes de publicar.',
      'wordpress-hardcoded-config-secret': 'Hay una credencial de base de datos escrita directamente en wp-config.php. No la muestres ni la subas: usa secretos de despliegue y rota la credencial si el repositorio se compartió.',
      'wordpress-file-editor-config': 'El editor de archivos WordPress está habilitado. En producción desactívalo para reducir el daño si una cuenta de administrador se ve comprometida.',
      'wordpress-rest-route-permission': 'Esta ruta REST puede permitir acceso sin una comprobación de permisos. Revisa autorización antes de publicarla.',
      'wordpress-rest-route-public': 'Esta ruta REST es pública de forma explícita. Comprueba que exponer sus datos y permitir peticiones sin iniciar sesión sea intencionado.',
      'wordpress-rest-route-protected': 'YCF encontró una comprobación de capacidad en los permisos de esta ruta REST. No cambia nada: revisa que la capacidad elegida sea la adecuada.',
      'wordpress-rest-route-permission-review': 'La ruta declara permisos, pero YCF no puede demostrar una comprobación de capacidad. Revisa el callback antes de publicarla.',
      'wordpress-rest-route-callback-review': 'No se pudo localizar el callback de esta ruta REST en los PHP revisados. Comprueba que exista y pueda cargarse al publicar.',
      'wordpress-rest-persistence-review': 'Un dato de una ruta REST llega a una operación de guardado sin sanitización visible. Comprueba su tipo, valida y sanea antes de almacenarlo.',
      'wordpress-wpdb-unprepared-query': 'Esta consulta $wpdb introduce un valor directamente en SQL. Riesgo de inyección: usa $wpdb->prepare y el placeholder adecuado antes de ejecutarla.',
      'wordpress-destructive-operation-review': 'Esta acción WordPress borra o elimina datos sin protección demostrable. Antes de publicarla, revisa nonce y permisos en AJAX, o la política de permisos en REST.',
      'wordpress-privilege-escalation-review': 'Esta acción puede dar roles o capacidades. Es muy sensible: exige nonce y una capacidad fuerte como promote_users o manage_options antes de publicarla.',
      'wordpress-sensitive-data-exposure': 'Este endpoint parece enviar un email, token, contraseña o clave. Confirma que sea necesario, que el usuario tenga permiso y que la respuesta no quede pública, en caché o en logs.',
      'wordpress-ajax-nonce-review': 'Esta acción AJAX puede no protegerse contra solicitudes falsas. Revisa el nonce dentro del callback antes de publicarla.',
      'wordpress-ajax-capability-review': 'Esta acción AJAX puede no comprobar permisos del usuario. Revisa capacidades dentro del callback antes de publicarla.',
      'wordpress-cross-file-data-flow-review': 'Este dato recibido viaja a un helper en otro archivo. El informe indica si se ve escape en la salida, pero valida y sanea el dato antes de usarlo.',
      'wordpress-unsanitized-input': 'Se usa un dato recibido desde una petición. Comprueba validación y sanitización antes de usarlo o guardarlo.',
      'wordpress-unescaped-output': 'Se muestra una variable sin escape visible. Comprueba el tipo de dato y aplica el escape adecuado antes de mostrarlo.',
      'high-complexity': 'Esta lógica tiene muchas decisiones. Simplifícala por partes y valida cada cambio.',
      'duplicate-code': 'Hay código repetido. Comprueba que hace exactamente lo mismo antes de consolidarlo.',
      'similar-duplicate-code': 'Hay código probablemente duplicado: se parece en estructura, pero puede diferir en nombres o valores. No lo unas sin comparar entradas, errores y efectos.',
      'unused-production-dependency': 'Esta dependencia parece no usarse estáticamente. Puede cargarse en tiempo de ejecución: no la elimines sin comprobarlo.'
    },
    en: {
      'debug-statements': 'A debugger pause was found. Low risk: YCF can remove it and verify the project.',
      'debug-console': 'A safe debug message was found. Low risk: YCF can remove it and verify the project.',
      'unused-import': 'This named import is unused. Low risk: YCF keeps the module load and can remove only the binding.',
      'sensitive-repository-file': 'A file has a secret, key, real configuration, or backup-like name. YCF did not read it: ensure it is not committed or publicly deployed.',
      'sensitive-repository-file-tracked': 'This sensitive-looking file is already tracked by Git. It may reach the repository: remove it safely, rotate credentials, and use deployment secrets.',
      'sensitive-repository-file-protected': 'This local sensitive-looking file is ignored by Git. Keep the rule and confirm it is not tracked in another branch or release artifact.',
      'long-function': 'This function is hard to understand and change. Review its consumers before splitting responsibilities.',
      'large-react-component': 'This component mixes too much logic and UI. Review what can be extracted without changing behavior.',
      'react-effect-without-dependencies': 'This effect runs after every render. It may be intentional; review it before adding dependencies.',
      'wordpress-dynamic-entrypoint': 'WordPress may call this code dynamically. Do not delete it or mark it unused before reviewing the hook or route.',
      'wordpress-dynamic-callback-review': 'This WordPress callback is dynamic or a closure. YCF cannot prove its safety, so review it before release.',
      'wordpress-production-debug-config': 'WordPress debugging is enabled in configuration. In production it can expose errors or internal paths: disable visible output before release.',
      'wordpress-hardcoded-config-secret': 'A database credential is written directly in wp-config.php. Do not display or commit it: use deployment secrets and rotate it if the repository was shared.',
      'wordpress-file-editor-config': 'The WordPress file editor is enabled. Disable it in production to reduce damage if an administrator account is compromised.',
      'wordpress-rest-route-permission': 'This REST route may allow access without a permission check. Review authorization before release.',
      'wordpress-rest-route-public': 'This REST route is explicitly public. Confirm that its data exposure and unauthenticated access are intentional.',
      'wordpress-rest-route-protected': 'YCF found a capability check in this REST route permission callback. Confirm that the selected capability is appropriate.',
      'wordpress-rest-route-permission-review': 'This route declares permissions, but YCF cannot prove a capability check. Review the callback before release.',
      'wordpress-rest-route-callback-review': 'This REST route callback could not be located in the inspected PHP files. Confirm it exists and loads after release.',
      'wordpress-rest-persistence-review': 'A REST route value reaches storage without visible sanitization. Check its type, validate it, and sanitize it before storing.',
      'wordpress-wpdb-unprepared-query': 'This $wpdb query inserts a value directly into SQL. Injection risk: use $wpdb->prepare and an appropriate placeholder before executing it.',
      'wordpress-destructive-operation-review': 'This WordPress action deletes data without proven protection. Before release, review nonce and permissions for AJAX, or the permission policy for REST.',
      'wordpress-privilege-escalation-review': 'This action can grant roles or capabilities. It is highly sensitive: require a nonce and a strong capability such as promote_users or manage_options before release.',
      'wordpress-sensitive-data-exposure': 'This endpoint appears to return an email, token, password, or key. Confirm it is necessary, authorized, and not publicly cached or logged.',
      'wordpress-ajax-nonce-review': 'This AJAX action may lack protection against forged requests. Review nonce verification inside its callback before release.',
      'wordpress-ajax-capability-review': 'This AJAX action may not check user permissions. Review capabilities inside its callback before release.',
      'wordpress-cross-file-data-flow-review': 'This request value flows to a helper in another file. The report notes visible output escaping, but validate and sanitize the value before use.',
      'wordpress-unsanitized-input': 'Request input is used here. Review validation and sanitization before using or storing it.',
      'wordpress-unescaped-output': 'A variable is rendered without visible escaping. Review the data context and escape it before rendering.',
      'high-complexity': 'This logic has many decisions. Simplify it in small validated steps.',
      'duplicate-code': 'Repeated code was found. Confirm identical behavior before consolidating it.',
      'similar-duplicate-code': 'Likely duplicate code was found: its structure matches but names or values may differ. Do not merge it before comparing inputs, errors, and side effects.',
      'unused-production-dependency': 'This dependency appears unused statically. It may load at runtime; verify before removal.'
    },
    fr: {
      'debug-statements': 'Une pause de débogage a été détectée. Risque faible : YCF peut la supprimer et vérifier le projet.',
      'debug-console': 'Un message de débogage sûr a été détecté. Risque faible : YCF peut le supprimer et vérifier le projet.',
      'unused-import': 'Cet import nommé n’est pas utilisé. Risque faible : YCF conserve le chargement du module et retire seulement le binding.',
      'sensitive-repository-file': 'Un fichier a un nom de secret, clé, configuration réelle ou sauvegarde. YCF ne l’a pas lu : vérifiez qu’il n’est ni commité ni déployé publiquement.',
      'sensitive-repository-file-tracked': 'Ce fichier sensible est déjà suivi par Git. Il peut atteindre le dépôt : retirez-le de façon sûre, faites tourner les crédentials et utilisez des secrets de déploiement.',
      'sensitive-repository-file-protected': 'Ce fichier sensible local est ignoré par Git. Gardez la règle et vérifiez qu’il n’est pas suivi dans une autre branche ou un artefact de publication.',
      'long-function': 'Cette fonction est difficile à comprendre et à modifier. Vérifiez ses consommateurs avant de la découper.',
      'large-react-component': 'Ce composant mélange trop de logique et d’interface. Vérifiez ce qui peut être extrait sans changer le comportement.',
      'react-effect-without-dependencies': 'Cet effet est exécuté après chaque rendu. Cela peut être intentionnel ; vérifiez avant d’ajouter des dépendances.',
      'wordpress-dynamic-entrypoint': 'WordPress peut appeler ce code dynamiquement. Ne le supprimez pas et ne le marquez pas comme inutilisé avant de vérifier le hook ou la route.',
      'wordpress-dynamic-callback-review': 'Ce callback WordPress est dynamique ou une closure. YCF ne peut pas prouver sa sécurité : vérifiez-le avant publication.',
      'wordpress-production-debug-config': 'Le débogage WordPress est activé dans la configuration. En production, il peut exposer des erreurs ou chemins internes : désactivez l’affichage visible avant publication.',
      'wordpress-hardcoded-config-secret': 'Une crédentiale de base de données est écrite directement dans wp-config.php. Ne l’affichez pas et ne la commitez pas : utilisez des secrets de déploiement et faites-la tourner si le dépôt a été partagé.',
      'wordpress-file-editor-config': 'L’éditeur de fichiers WordPress est activé. Désactivez-le en production pour limiter les dégâts si un compte administrateur est compromis.',
      'wordpress-rest-route-permission': 'Cette route REST peut autoriser un accès sans contrôle de permission. Vérifiez l’autorisation avant la publication.',
      'wordpress-rest-route-public': 'Cette route REST est explicitement publique. Vérifiez que l’exposition des données et l’accès sans connexion sont intentionnels.',
      'wordpress-rest-route-protected': 'YCF a trouvé un contrôle de capacité dans les permissions de cette route REST. Vérifiez que la capacité choisie est adaptée.',
      'wordpress-rest-route-permission-review': 'Cette route déclare des permissions, mais YCF ne peut pas prouver un contrôle de capacité. Vérifiez le callback avant publication.',
      'wordpress-rest-route-callback-review': 'Le callback de cette route REST n’a pas pu être trouvé dans les fichiers PHP inspectés. Vérifiez son existence et son chargement après publication.',
      'wordpress-rest-persistence-review': 'Une valeur de route REST arrive au stockage sans sanitisation visible. Vérifiez son type, validez-la et assainissez-la avant stockage.',
      'wordpress-wpdb-unprepared-query': 'Cette requête $wpdb insère une valeur directement dans SQL. Risque d’injection : utilisez $wpdb->prepare et un placeholder adapté avant exécution.',
      'wordpress-destructive-operation-review': 'Cette action WordPress supprime des données sans protection démontrable. Avant publication, vérifiez nonce et permissions pour AJAX, ou la politique de permission REST.',
      'wordpress-privilege-escalation-review': 'Cette action peut attribuer des rôles ou capacités. Elle est très sensible : exigez un nonce et une capacité forte telle que promote_users ou manage_options avant publication.',
      'wordpress-sensitive-data-exposure': 'Cet endpoint semble renvoyer un email, token, mot de passe ou clé. Vérifiez que cela est nécessaire, autorisé et non mis en cache ou journalisé publiquement.',
      'wordpress-ajax-nonce-review': 'Cette action AJAX peut manquer de protection contre les requêtes forgées. Vérifiez le nonce dans son callback avant publication.',
      'wordpress-ajax-capability-review': 'Cette action AJAX peut ne pas vérifier les permissions de l’utilisateur. Vérifiez les capacités dans son callback avant publication.',
      'wordpress-cross-file-data-flow-review': 'Cette donnée de requête passe vers un helper dans un autre fichier. Le rapport indique l’échappement visible, mais validez et assainissez-la avant utilisation.',
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
  const language: Language = validLanguage(options.language) ? options.language : config.language;
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
  console.log(`Duplicate groups: ${report.duplicates.length} (${report.duplicates.filter((group) => group.kind === 'exact').length} confirmed, ${report.duplicates.filter((group) => group.kind === 'similar').length} likely)`);
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

program.command('release [target]').description('Check whether a repository is ready to publish without changing source code.').option('--dependencies', 'Also query public production dependency advisories (read-only network check).').option('--json', 'Emit the complete readiness report as JSON.').option('--language <language>', 'Response language: en, es, pt, fr, de, it, ar, or zh.').action((target = '.', options) => {
  const report = releaseReadiness(target, options.dependencies ? dependencyAudit(target) : undefined);
  const config = loadConfig(target);
  const language = validLanguage(options.language) ? options.language : config.language;
  const paths = writeReleaseReport(target, report, language);
  if (options.json) { console.log(JSON.stringify(report, null, 2)); return; }
  console.log(`YCF — ${releaseHeading(language, report.ready)}`);
  for (const check of report.checks) console.log(`${check.status === 'passed' ? '✓' : check.status === 'failed' ? '✗' : '!'} ${releaseCheckLabel(language, check)}`);
  console.log(`${releaseReportLabel(language)}: ${paths.markdownPath}`);
  if (!report.ready) process.exitCode = 1;
});

program.command('dependencies [target]').description('Read package-manager vulnerability advisories without changing dependencies.').option('--dry-run', 'Show the external read-only command without running it.').option('--json', 'Emit the complete dependency report as JSON.').option('--language <language>', 'Response language: en, es, pt, fr, de, it, ar, or zh.').action((target = '.', options) => {
  if (options.dryRun) {
    const plan = dependencyAuditPlan(target);
    console.log(plan.command.length ? plan.command.join(' ') : 'No package.json was found.');
    return;
  }
  const report = dependencyAudit(target);
  const config = loadConfig(target);
  const language: Language = validLanguage(options.language) ? options.language : config.language;
  const paths = writeDependencyAuditReport(target, report);
  if (options.json) { console.log(JSON.stringify(report, null, 2)); return; }
  const labels: Record<Language, { unavailable: string; clean: string; found: string; report: string }> = {
    en: { unavailable: 'Dependency advisories could not be retrieved', clean: 'No production dependency vulnerabilities reported', found: 'Production dependency vulnerabilities to review', report: 'Report' },
    es: { unavailable: 'No se pudieron consultar los avisos de dependencias', clean: 'No se reportaron vulnerabilidades en dependencias de producción', found: 'Vulnerabilidades de dependencias de producción para revisar', report: 'Informe' },
    pt: { unavailable: 'Não foi possível consultar avisos de dependências', clean: 'Não há vulnerabilidades reportadas nas dependências de produção', found: 'Vulnerabilidades de dependências de produção para revisar', report: 'Relatório' },
    fr: { unavailable: 'Les avis de dépendances n’ont pas pu être consultés', clean: 'Aucune vulnérabilité de dépendance de production signalée', found: 'Vulnérabilités de dépendances de production à examiner', report: 'Rapport' },
    de: { unavailable: 'Abhängigkeitshinweise konnten nicht abgerufen werden', clean: 'Keine gemeldeten Sicherheitslücken in Produktionsabhängigkeiten', found: 'Sicherheitslücken in Produktionsabhängigkeiten prüfen', report: 'Bericht' },
    it: { unavailable: 'Non è stato possibile consultare gli avvisi delle dipendenze', clean: 'Nessuna vulnerabilità segnalata nelle dipendenze di produzione', found: 'Vulnerabilità delle dipendenze di produzione da verificare', report: 'Rapporto' },
    ar: { unavailable: 'تعذر الحصول على تنبيهات التبعيات', clean: 'لا توجد ثغرات مُبلغ عنها في تبعيات الإنتاج', found: 'ثغرات في تبعيات الإنتاج تحتاج إلى مراجعة', report: 'التقرير' },
    zh: { unavailable: '无法获取依赖项安全公告', clean: '未报告生产依赖项漏洞', found: '需要检查的生产依赖项漏洞', report: '报告' }
  };
  const copy = labels[language];
  if (!report.available) { console.log(`YCF — ${copy.unavailable}: ${report.error}`); process.exitCode = 1; }
  else if (!report.vulnerabilities.length) console.log(`YCF — ${copy.clean}`);
  else {
    console.log(`YCF — ${copy.found}: ${report.vulnerabilities.length}`);
    for (const item of report.vulnerabilities) console.log(`[${item.severity}] ${item.name}${item.fixAvailable ? ' — update available' : ''}`);
  }
  console.log(`${copy.report}: ${paths.markdownPath}`);
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
