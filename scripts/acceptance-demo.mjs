import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { executeRefactorPlan, writeRefactorExecutionReport } from '../packages/core/dist/index.js';

const fixture = mkdtempSync(join(tmpdir(), 'ycf-acceptance-'));
const write = (file, content) => { const path = join(fixture, file); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, content, 'utf8'); };
const git = (args) => execFileSync('git', ['-C', fixture, ...args], { encoding: 'utf8' }).trim();
const run = (command, args) => execFileSync(command, args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

write('package.json', JSON.stringify({ name: 'ycf-acceptance-fixture', private: true, type: 'module', scripts: { test: 'node --test', build: 'node --check src/app.mjs && node --check src/features/feature.mjs' } }, null, 2));
write('src/legacy/math.mjs', 'export const add = (left, right) => left + right;\n');
write('src/legacy/feature.mjs', "import { add } from './math.mjs';\nimport { formatTotal } from './text.mjs';\nexport const total = add(1, 2);\nexport const label = formatTotal(' demo ');\n");
write('src/app.mjs', "import { total, label } from './legacy/feature.mjs';\nexport { total, label };\n");
write('src/legacy/text.mjs', "export function formatTotal(label) {\n  return label.trim();\n}\n");
write('src/legacy/greeting.mjs', "export const greeting = () => 'hi';\n");
write('src/use-greeting.mjs', "import { greeting } from './legacy/greeting.mjs';\nexport const message = greeting();\n");
write('src/legacy/format-a.mjs', 'export const formatName = (name) => name.trim();\n');
write('src/legacy/format-b.mjs', 'export const formatName = (name) => name.trim();\n');
write('src/use-format.mjs', "import { formatName } from './legacy/format-b.mjs';\nexport const formatted = formatName(' demo ');\n");
write('test/app.test.mjs', "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { total, label } from '../src/app.mjs';\ntest('real fixture still works after the move', () => assert.equal(total, 3));\ntest('the extracted module resolves at runtime under native ESM', () => assert.equal(label, 'demo'));\n");
git(['init', '-q']); git(['config', 'user.email', 'ycf-demo@example.com']); git(['config', 'user.name', 'YCF Acceptance Demo']); git(['add', '.']); git(['commit', '-qm', 'fixture: initial working project']);

const block = (id, operations, dependencies = []) => ({ id, type: 'ACCEPTANCE_DEMO', goal: id, reason: 'reproducible acceptance fixture', risk: 'LOW', confidence: 99, mode: 'SAFE', files: [], dependencies, affectedModules: [], preconditions: [], operations, validation: [], rollback: [{ kind: 'undo-operation', description: 'Undo this block operation journal.' }], status: 'PLANNED' });
const plan = { version: 2, target: fixture, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 5, safeRefactor: 5, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
  block('BLOCK-001', [{ id: 'move-feature', kind: 'MOVE', description: 'Move feature and update every static reference', source: 'src/legacy/feature.mjs', destination: 'src/features/feature.mjs', updateImports: true }]),
  block('BLOCK-002', [{ id: 'extract-format-total', kind: 'EXTRACT', description: 'Extract formatTotal into its own module', sourceFile: 'src/legacy/text.mjs', targetFile: 'src/legacy/format-total.mjs', range: { startLine: 1, endLine: 3 }, exportedNames: ['formatTotal'] }]),
  block('BLOCK-003', [{ id: 'rename-greeting', kind: 'RENAME', description: 'Rename greeting and update its one consumer', source: 'src/legacy/greeting.mjs', destination: 'src/legacy/hello.mjs', updateImports: true }]),
  block('BLOCK-004', [{ id: 'consolidate-format', kind: 'CONSOLIDATE', description: 'Consolidate an exact duplicate into the canonical module', canonicalFile: 'src/legacy/format-a.mjs', duplicateFile: 'src/legacy/format-b.mjs', symbol: 'formatName' }]),
  block('BLOCK-005', [{ id: 'create-temporary-file', kind: 'CREATE', description: 'Create a file that must be rolled back with this failed block', file: 'src/features/should-not-survive.mjs', content: 'export const broken = true;\n' }, { id: 'controlled-failure', kind: 'RENAME', description: 'Controlled failure after the first operation', source: 'src/features/missing.mjs', destination: 'src/features/never-created.mjs', updateImports: true }], ['BLOCK-001']),
  block('BLOCK-006', [{ id: 'independent-after-rollback', kind: 'CREATE', description: 'An unrelated block keeps going after BLOCK-005 rolls back in isolation', file: 'src/independent-after-rollback.mjs', content: 'export const healthy = true;\n' }])
] };

const before = git(['diff', '--no-ext-diff']);
const result = executeRefactorPlan(fixture, plan, { fullVerify: true });
git(['add', '-N', 'src/features/feature.mjs', 'src/legacy/format-total.mjs', 'src/legacy/hello.mjs', 'src/independent-after-rollback.mjs']);
const after = git(['diff', '--no-ext-diff']);

assert.deepEqual(result.keptBlocks, ['BLOCK-001', 'BLOCK-002', 'BLOCK-003', 'BLOCK-004', 'BLOCK-006']);
assert.deepEqual(result.rolledBackBlocks, ['BLOCK-005']);
assert.equal(existsSync(join(fixture, 'src/features/feature.mjs')), true);
assert.equal(existsSync(join(fixture, 'src/legacy/feature.mjs')), false);
assert.equal(existsSync(join(fixture, 'src/legacy/format-total.mjs')), true);
assert.equal(existsSync(join(fixture, 'src/legacy/hello.mjs')), true);
assert.equal(existsSync(join(fixture, 'src/legacy/greeting.mjs')), false);
assert.equal(existsSync(join(fixture, 'src/legacy/format-b.mjs')), false);
assert.equal(existsSync(join(fixture, 'src/features/should-not-survive.mjs')), false);
assert.equal(existsSync(join(fixture, 'src/independent-after-rollback.mjs')), true);
assert.match(readFileSync(join(fixture, 'src/app.mjs'), 'utf8'), /\.\/features\/feature\.mjs/);
assert.match(readFileSync(join(fixture, 'src/features/feature.mjs'), 'utf8'), /\.\.\/legacy\/math\.mjs/);
assert.match(readFileSync(join(fixture, 'src/legacy/text.mjs'), 'utf8'), /from '\.\/format-total\.mjs'/);
assert.match(readFileSync(join(fixture, 'src/use-greeting.mjs'), 'utf8'), /\.\/legacy\/hello\.mjs/);
assert.match(readFileSync(join(fixture, 'src/use-format.mjs'), 'utf8'), /\.\/legacy\/format-a\.mjs/);
assert.ok(result.before?.architecture && result.after?.architecture, 'L: architecture captured before and after');

const journal = JSON.parse(readFileSync(join(fixture, '.ycf/refactor-checkpoints.json'), 'utf8'));
const { markdownPath: refactorReportPath } = writeRefactorExecutionReport(fixture, result);
const architectureSection = readFileSync(refactorReportPath, 'utf8').split('## Architecture')[1]?.split('## Blocks')[0]?.trim() ?? '(not generated)';
const report = [
  '# YCF acceptance demo', '', `Fixture: ${fixture}`, '',
  `- BLOCK-001 (MOVE): **${journal.blocks[0].status}** — moved a real module and rewrote every static reference to it.`,
  `- BLOCK-002 (EXTRACT): **${journal.blocks[1].status}** — split one exported declaration into its own module.`,
  `- BLOCK-003 (RENAME): **${journal.blocks[2].status}** — renamed a module and rewrote its one consumer.`,
  `- BLOCK-004 (CONSOLIDATE): **${journal.blocks[3].status}** — merged an exact duplicate into the canonical module and rewrote its consumer.`,
  `- BLOCK-005 (forced failure): **${journal.blocks[4].status}** — failed deliberately and removed only its own created file.`,
  `- BLOCK-006 (independent): **${journal.blocks[5].status}** — an unrelated block kept going after BLOCK-005 rolled back in isolation.`,
  '- Every prior verified block preserved: **yes**', '- Legacy modules removed: **yes**', '',
  '## Before diff', '', '```text', before || '(clean fixture)', '```', '',
  '## After diff', '', '```diff', after, '```', '',
  '## Architecture (before → after)', '', architectureSection, ''
].join('\n');
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true }); writeFileSync(join(process.cwd(), 'artifacts/acceptance-demo.md'), report, 'utf8');
console.log(report); console.log(`Fixture kept at: ${fixture}`); console.log(`Report: ${relative(process.cwd(), join(process.cwd(), 'artifacts/acceptance-demo.md'))}`);
