import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { executeRefactorPlan } from '../packages/core/dist/index.js';

const fixture = mkdtempSync(join(tmpdir(), 'ycf-acceptance-'));
const write = (file, content) => { const path = join(fixture, file); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, content, 'utf8'); };
const git = (args) => execFileSync('git', ['-C', fixture, ...args], { encoding: 'utf8' }).trim();
const run = (command, args) => execFileSync(command, args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

write('package.json', JSON.stringify({ name: 'ycf-acceptance-fixture', private: true, type: 'module', scripts: { test: 'node --test', build: 'node --check src/app.mjs && node --check src/features/feature.mjs' } }, null, 2));
write('src/legacy/math.mjs', 'export const add = (left, right) => left + right;\n');
write('src/legacy/feature.mjs', "import { add } from './math.mjs';\nexport const total = add(1, 2);\n");
write('src/app.mjs', "import { total } from './legacy/feature.mjs';\nexport { total };\n");
write('test/app.test.mjs', "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { total } from '../src/app.mjs';\ntest('real fixture still works after the move', () => assert.equal(total, 3));\n");
git(['init', '-q']); git(['config', 'user.email', 'ycf-demo@example.com']); git(['config', 'user.name', 'YCF Acceptance Demo']); git(['add', '.']); git(['commit', '-qm', 'fixture: initial working project']);

const block = (id, operations, dependencies = []) => ({ id, type: 'ACCEPTANCE_DEMO', goal: id, reason: 'reproducible acceptance fixture', risk: 'LOW', confidence: 99, mode: 'SAFE', files: [], dependencies, affectedModules: [], preconditions: [], operations, validation: [], rollback: [{ kind: 'undo-operation', description: 'Undo this block operation journal.' }], status: 'PLANNED' });
const plan = { version: 2, target: fixture, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 2, safeRefactor: 2, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
  block('BLOCK-001', [{ id: 'move-feature', kind: 'MOVE', description: 'Move feature and update every static reference', source: 'src/legacy/feature.mjs', destination: 'src/features/feature.mjs', updateImports: true }]),
  block('BLOCK-002', [{ id: 'create-temporary-file', kind: 'CREATE', description: 'Create a file that must be rolled back with this failed block', file: 'src/features/should-not-survive.mjs', content: 'export const broken = true;\n' }, { id: 'controlled-failure', kind: 'RENAME', description: 'Controlled failure after the first operation', source: 'src/features/missing.mjs', destination: 'src/features/never-created.mjs', updateImports: true }], ['BLOCK-001'])
] };

const before = git(['diff', '--no-ext-diff']);
const result = executeRefactorPlan(fixture, plan, { fullVerify: true });
git(['add', '-N', 'src/features/feature.mjs']);
const after = git(['diff', '--no-ext-diff']);
assert.deepEqual(result.keptBlocks, ['BLOCK-001']);
assert.deepEqual(result.rolledBackBlocks, ['BLOCK-002']);
assert.equal(existsSync(join(fixture, 'src/features/feature.mjs')), true);
assert.equal(existsSync(join(fixture, 'src/legacy/feature.mjs')), false);
assert.equal(existsSync(join(fixture, 'src/features/should-not-survive.mjs')), false);
assert.match(readFileSync(join(fixture, 'src/app.mjs'), 'utf8'), /\.\/features\/feature\.mjs/);
assert.match(readFileSync(join(fixture, 'src/features/feature.mjs'), 'utf8'), /\.\.\/legacy\/math\.mjs/);
const journal = JSON.parse(readFileSync(join(fixture, '.ycf/refactor-checkpoints.json'), 'utf8'));
const report = [
  '# YCF acceptance demo', '', `Fixture: ${fixture}`, '',
  `- BLOCK-001: **${journal.blocks[0].status}** — moved a real module, rewrote imports, and passed test/build verification.`,
  `- BLOCK-002: **${journal.blocks[1].status}** — failed deliberately and removed only its own created file.`,
  '- Previous block preserved: **yes**', '- Legacy module removed: **yes**', '',
  '## Before diff', '', '```text', before || '(clean fixture)', '```', '',
  '## After diff', '', '```diff', after, '```', ''
].join('\n');
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true }); writeFileSync(join(process.cwd(), 'artifacts/acceptance-demo.md'), report, 'utf8');
console.log(report); console.log(`Fixture kept at: ${fixture}`); console.log(`Report: ${relative(process.cwd(), join(process.cwd(), 'artifacts/acceptance-demo.md'))}`);
