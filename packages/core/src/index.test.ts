import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { aiResidueFindings, audit, cleanupDebugStatements, cleanupDevArtifacts, detectStacks, duplicateGroups, loadConfig, refactorPlan, releaseCheckLabel, releaseReadiness, understand, verificationPlan, writeAuditReport, writeReleaseReport, writeUnfuckReport } from './index.js';

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('stack detection', () => {
  it('detects TypeScript and React from a Node package', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"dependencies":{"react":"19.0.0","typescript":"5.0.0"}}');
    writeFileSync(join(directory, 'tsconfig.json'), '{}');
    expect(detectStacks(directory)).toEqual(['javascript', 'typescript', 'react']);
  });

  it('keeps audit read-only and returns deterministic findings and a score', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'index.js'), 'debugger;');
    const report = audit(directory);
    expect(report.readOnly).toBe(true);
    expect(report.sourceFiles).toBe(1);
    expect(report.findings).toMatchObject([{ ruleId: 'debug-statements', risk: 'auto', lines: [1], scoreImpact: 2 }]);
    expect(report.score).toMatchObject({ fucked: 2, health: 98, method: 'deterministic-v1' });
  });

  it('reports residue instead of automatically deleting it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'service.ts'), '// temporary fix: remove after migration');
    const [finding] = audit(directory).findings;
    expect(finding).toMatchObject({ ruleId: 'ai-residue', risk: 'report-only', lines: [1] });
  });

  it('finds suspicious iterative filenames without touching the file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'checkout-final-final.ts');
    writeFileSync(path, 'export const checkout = true;');
    expect(aiResidueFindings(directory)).toMatchObject([{ ruleId: 'suspicious-filename', file: 'checkout-final-final.ts', risk: 'report-only' }]);
    expect(existsSync(path)).toBe(true);
  });

  it('removes only parser-confirmed debugger statements and preserves comments', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'service.ts');
    writeFileSync(path, '// debugger; must remain a comment\nexport function run() { debugger; return true; }');
    expect(cleanupDebugStatements(directory)).toMatchObject({ removedDebugStatements: 1, changedFiles: [{ file: 'service.ts', removedDebugStatements: 1 }] });
    expect(readFileSync(path, 'utf8')).toBe('// debugger; must remain a comment\nexport function run() {  return true; }');
  });

  it('removes only literal debug console calls and preserves calls with possible effects', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'log.ts');
    writeFileSync(path, "console.debug('inspect');\nconsole.log('[debug] state', 1);\nconsole.debug(loadState());\nconsole.log('production log', 1);");
    expect(audit(directory).findings).toMatchObject([{ ruleId: 'debug-console', risk: 'auto', lines: [1, 2] }]);
    expect(cleanupDevArtifacts(directory)).toMatchObject({ removedDebugStatements: 0, removedDebugConsoleCalls: 2 });
    expect(readFileSync(path, 'utf8')).toBe("\n\nconsole.debug(loadState());\nconsole.log('production log', 1);");
  });

  it('removes one unused named import while preserving the module import and single-binding imports', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'imports.ts');
    writeFileSync(path, "import { unused, used } from './module';\nimport { sideEffectOnly } from './side-effect';\nused();");
    expect(audit(directory).findings).toMatchObject([{ ruleId: 'unused-import', risk: 'auto', lines: [1] }]);
    expect(cleanupDevArtifacts(directory)).toMatchObject({ removedUnusedImports: 1 });
    expect(readFileSync(path, 'utf8')).toBe("import { used } from './module';\nimport { sideEffectOnly } from './side-effect';\nused();");
  });

  it('reports oversized React components and effects without dependencies without changing them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_function_lines: 3\n');
    writeFileSync(join(directory, 'Dashboard.tsx'), [
      "import { useEffect } from 'react';",
      'export function Dashboard() {',
      '  useEffect(() => { loadDashboard(); });',
      "  const heading = 'Dashboard';",
      '  return <section>{heading}</section>;',
      '}'
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('long-function');
    expect(rules).toContain('large-react-component');
    expect(rules).toContain('react-effect-without-dependencies');
  });

  it('recognizes WordPress hooks only inside PHP files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'plugin.php'), '<?php add_action("init", "ycf_boot");');
    expect(detectStacks(directory)).toEqual(['php', 'wordpress']);
  });

  it('protects dynamic WordPress entry points and flags REST routes without permission callbacks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'plugin.php'), [
      '<?php',
      "add_action('init', 'boot_plugin');",
      "add_shortcode('widget', 'render_widget');",
      "add_action('wp_ajax_save_widget', 'save_widget');",
      "wp_schedule_event(time(), 'daily', 'refresh_widget');",
      "register_rest_route('ycf/v1', '/widget', array('methods' => 'GET', 'callback' => 'get_widget'));"
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);

    expect(rules).toContain('wordpress-dynamic-entrypoint');
    expect(rules).toContain('wordpress-rest-route-permission');
    expect(rules).toContain('wordpress-ajax-nonce-review');
    expect(rules).toContain('wordpress-ajax-capability-review');
  });

  it('reports WordPress AJAX and request-data security checks without changing source', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'ajax.php');
    writeFileSync(path, [
      '<?php',
      "add_action('wp_ajax_save_profile', 'save_profile');",
      "$name = $_POST['name'];",
      'echo $name;'
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('wordpress-ajax-nonce-review');
    expect(rules).toContain('wordpress-ajax-capability-review');
    expect(rules).toContain('wordpress-unsanitized-input');
    expect(rules).toContain('wordpress-unescaped-output');
    expect(readFileSync(path, 'utf8')).toContain("$_POST['name']");
  });

  it('honours the configured file-size limit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_file_lines: 2\n');
    writeFileSync(join(directory, 'large.ts'), 'one\ntwo\nthree');
    expect(audit(directory).findings).toMatchObject([{ ruleId: 'large-source-file', lines: [1, 3] }]);
  });

  it('loads the selected language and explanation audience', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'language: pt\naudience: guided\n');
    expect(loadConfig(directory)).toMatchObject({ language: 'pt', audience: 'guided' });
  });

  it('writes an architecture map and persistent audit reports outside source files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"main":"./entry.ts"}');
    writeFileSync(join(directory, 'entry.ts'), "import { value } from './value.js';\nconsole.log(value);");
    writeFileSync(join(directory, 'value.js'), 'export const value = 1;');
    const map = understand(directory);
    const paths = writeAuditReport(directory);
    expect(map.dependencies).toEqual([{ from: 'entry.ts', to: 'value.js' }]);
    expect(map.graph.nodes).toContainEqual({ id: 'entry.ts', file: 'entry.ts', kind: 'entry-point', entryPoint: true });
    expect(existsSync(join(directory, '.ycf', 'architecture.md'))).toBe(true);
    expect(existsSync(paths.jsonPath)).toBe(true);
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('FUCKED SCORE');
  });

  it('detects local dependency cycles so they can be reviewed before refactoring', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'first.ts'), "import { second } from './second.js';\nexport const first = second;");
    writeFileSync(join(directory, 'second.ts'), "import { first } from './first.js';\nexport const second = first;");
    expect(understand(directory).graph.cycles).toEqual([['first.ts', 'second.ts', 'first.ts']]);
  });

  it('reports complexity, exact duplicate blocks and unreferenced production dependencies without changing code', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_complexity: 2\n');
    writeFileSync(join(directory, 'package.json'), '{"dependencies":{"left-pad":"1.0.0"}}');
    const duplicate = [
      'const a = "this exact code block is deliberately long enough to be meaningful";',
      'const b = a.trim();',
      'const c = b.toUpperCase();',
      'const d = c.toLowerCase();',
      'const e = d.slice(0, 10);',
      'export { e };'
    ].join('\n');
    writeFileSync(join(directory, 'first.js'), `${duplicate}\nfunction branch() { if (one && two) { three(); } }`);
    writeFileSync(join(directory, 'second.js'), duplicate);
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('high-complexity');
    expect(rules).toContain('duplicate-code');
    expect(rules).toContain('unused-production-dependency');
    expect(duplicateGroups(directory, [join(directory, 'first.js'), join(directory, 'second.js')])).toMatchObject([{ lines: 6, occurrences: [{ file: 'first.js', startLine: 1 }, { file: 'second.js', startLine: 1 }] }]);
  });

  it('creates a verification plan only for scripts the project declares', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"packageManager":"pnpm@11.0.0","scripts":{"test":"vitest run","build":"tsc"}}');
    expect(verificationPlan(directory)).toMatchObject([
      { name: 'lint', status: 'skipped', output: 'No matching package script.' },
      { name: 'typecheck', status: 'skipped', output: 'No matching package script.' },
      { name: 'test', command: ['corepack', 'pnpm', 'run', 'test'] },
      { name: 'build', command: ['corepack', 'pnpm', 'run', 'build'] }
    ]);
  });

  it('writes a reproducible final report for an unfuck run', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const auditReport = audit(directory);
    const paths = writeUnfuckReport(directory, {
      target: directory,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      status: 'no-changes',
      before: auditReport,
      after: auditReport
    });
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('NO-CHANGES');
  });

  it('creates a refactor plan with impact information without changing source code', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_function_lines: 2\n');
    const path = join(directory, 'service.ts');
    const source = ['export function processOrder() {', '  const order = loadOrder();', '  validate(order);', '  return save(order);', '}'].join('\n');
    writeFileSync(path, source);
    const result = refactorPlan(directory);
    expect(result.plan.recommendations).toMatchObject([{ title: 'Split an oversized function', file: 'service.ts', requiresHumanReview: true }]);
    expect(readFileSync(path, 'utf8')).toBe(source);
    expect(existsSync(result.markdownPath)).toBe(true);
  });

  it('summarizes release readiness and persists a human-readable report', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'README.md'), '# Example');
    const report = releaseReadiness(directory);
    const paths = writeReleaseReport(directory, report);
    expect(report.ready).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({ name: 'verification', status: 'warning' }));
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('YCF — READY');
    expect(releaseCheckLabel('es', { name: 'git', status: 'failed', detail: 'ignored' })).toContain('crea un commit');
  });
});
