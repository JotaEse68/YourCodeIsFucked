# P0b — AST reference rewriting, transactional MOVE/RENAME, unified refactor engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both existing regex-based reference rewriters with one real TypeScript-AST rewriter, make MOVE/RENAME/CONSOLIDATE genuinely transactional, and route `ycf move`, the Cockpit's Reorganize tab, and `unfuck`/`seniorize` through the single existing `executeRefactorPlan` engine — with a persistent, restart-survivable rollback (`rollbackExecution`) replacing the Cockpit's in-memory-only undo.

**Architecture:** A new `ReferenceRewriter` interface with a real AST implementation (`packages/core/src/reference-rewriter.ts`) replaces both `refactor-operations.ts`'s `importSpecifierPattern` regex and the CLI's separate `rewriteImportsForMove` regex. `applyRefactorOperation`'s MOVE/RENAME/CONSOLIDATE branches compute every rewrite in memory before writing anything, roll back any partial writes on failure, and classify PHP involvement as SUPERVISED/BLOCKED instead of silently rewriting. `ycf move` and the Cockpit's `/apply/move` are rewritten to build one-block `ArchitecturalRefactorPlan`s and call the shared `executeRefactorPlan` — the only remaining write path. Persistent rollback reuses the checkpoint journal P1 already built (`.ycf/refactor-checkpoints.json` + its per-run archive directory), extended to look up a block in an older, archived run when it's no longer "current."

**Tech Stack:** TypeScript (NodeNext ESM), the `typescript` package's AST (`ts.createSourceFile`, already a dependency), Vitest, commander.js (CLI), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-20-p0b-unified-refactor-engine-design.md`

## Global Constraints

- TDD per task: failing test → implementation → passing test → commit. One commit per task, message format `type(scope): summary`.
- Every core-package task ends with `corepack pnpm --filter @jotaese68/core typecheck` and `corepack pnpm --filter @jotaese68/core test`, both green, before committing. Every CLI-package task additionally ends with `corepack pnpm --filter @jotaese68/ycf typecheck` green.
- No feature flags. Pre-1.0 — delete the old regexes and the old write paths outright. Do not keep them "as a fallback" or dead code.
- **At the end of this phase there must be exactly one code path that writes a refactored file's references to disk**: `applyRefactorOperation`, called only from `executeRefactorPlan`, called only from `ycf move`, the Cockpit's `/apply/move`, and `unfuck --apply-plan`/`seniorize`.
- `rewriteImportsForMove`, `relativeImport` (in `packages/cli/src/index.ts`) and `applyReorganizationMove` (in `packages/core/src/reorganization.ts`) are deleted, not kept as dead code or a fallback.
- Both regexes are deleted: `importSpecifierPattern` in `refactor-operations.ts` and the inline regex inside `rewriteImportsForMove`.
- PHP is never silently reference-rewritten. Moving a `.php` file is BLOCKED. Moving a JS/TS file that a `.php` file appears to reference is SUPERVISED. No PHP rewriter fallback exists yet — only the `ReferenceRewriter` interface is built, ready for a future `PhpReferenceRewriter`.
- Do not touch `packages/core/src/release.ts`.
- Do not start any part of the agent-interface work (`ycf plan-context`, schema validation, the SAFE/SUPERVISED/BLOCKED demo).
- No mocking anywhere in this codebase's tests, with exactly one deliberate, spec-sanctioned exception: Task 2's simulated mid-write-failure test, isolated into its own file so the file-wide `vi.mock` it needs cannot affect any other test.
- Manual verification before this phase is considered done: run `ycf move` for real, and exercise the Cockpit's Reorganize apply/undo flow for real (via the Cockpit's HTTP endpoints against a real fixture), not just green unit tests — the same "prove it with a real run" standard every prior plan in this repo has followed.

---

### Task 1: `ReferenceRewriter` — a real AST-based rewriter

**Files:**
- Create: `packages/core/src/reference-rewriter.ts`
- Test: `packages/core/src/reference-rewriter.test.ts`

**Interfaces:**
- Produces: `SpecifierMatch { start: number; end: number; specifier: string }`, `ReferenceRewriter { canHandle(file: string): boolean; findReferences(sourceFile: string, content: string): SpecifierMatch[]; rewrite(content: string, matches: SpecifierMatch[], newSpecifierFor: (match: SpecifierMatch) => string | undefined): string }`, `jsTsReferenceRewriter: ReferenceRewriter`. Task 2 imports and uses `jsTsReferenceRewriter` directly.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/reference-rewriter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { jsTsReferenceRewriter } from './reference-rewriter.js';

describe('jsTsReferenceRewriter.findReferences', () => {
  it('finds a real import, export-from, require(), and dynamic import() -- and nothing else', () => {
    const content = [
      "import { x } from './x';",
      "export * from './x';",
      "const mod = require('./x');",
      "const dyn = import('./x');",
      "// see also from './x' for context",
      "const note = \"see also from './x'\";"
    ].join('\n');
    const matches = jsTsReferenceRewriter.findReferences('source.ts', content);
    expect(matches).toHaveLength(4);
    expect(matches.every((match) => match.specifier === './x')).toBe(true);
  });

  it('finds export type { X } from and import type { X } from', () => {
    const content = "import type { X } from './x';\nexport type { X } from './x';\n";
    const matches = jsTsReferenceRewriter.findReferences('source.ts', content);
    expect(matches).toHaveLength(2);
  });

  it('leaves a dynamic import() with a non-literal specifier untouched', () => {
    const content = "const name = './x';\nconst dyn = import(name);\n";
    const matches = jsTsReferenceRewriter.findReferences('source.ts', content);
    expect(matches).toHaveLength(0);
  });

  it('leaves require() with a non-literal specifier untouched', () => {
    const content = "const name = './x';\nconst mod = require(name);\n";
    const matches = jsTsReferenceRewriter.findReferences('source.ts', content);
    expect(matches).toHaveLength(0);
  });

  it('canHandle is true for JS/TS-family extensions and false for others', () => {
    expect(jsTsReferenceRewriter.canHandle('a.ts')).toBe(true);
    expect(jsTsReferenceRewriter.canHandle('a.tsx')).toBe(true);
    expect(jsTsReferenceRewriter.canHandle('a.js')).toBe(true);
    expect(jsTsReferenceRewriter.canHandle('a.jsx')).toBe(true);
    expect(jsTsReferenceRewriter.canHandle('a.mjs')).toBe(true);
    expect(jsTsReferenceRewriter.canHandle('a.cjs')).toBe(true);
    expect(jsTsReferenceRewriter.canHandle('a.php')).toBe(false);
  });
});

describe('jsTsReferenceRewriter.rewrite', () => {
  it('replaces only the matched positions, leaving everything else untouched', () => {
    const content = "import { x } from './old';\nconsole.log('./old is not a specifier here');\n";
    const matches = jsTsReferenceRewriter.findReferences('source.ts', content);
    expect(matches).toHaveLength(1);
    const result = jsTsReferenceRewriter.rewrite(content, matches, () => './new');
    expect(result).toBe("import { x } from './new';\nconsole.log('./old is not a specifier here');\n");
  });

  it('leaves a match untouched when newSpecifierFor returns undefined', () => {
    const content = "import { a } from './a';\nimport { b } from './b';\n";
    const matches = jsTsReferenceRewriter.findReferences('source.ts', content);
    expect(matches).toHaveLength(2);
    const result = jsTsReferenceRewriter.rewrite(content, matches, (match) => match.specifier === './a' ? './renamed-a' : undefined);
    expect(result).toBe("import { a } from './renamed-a';\nimport { b } from './b';\n");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- reference-rewriter.test.ts`
Expected: FAIL — `Cannot find module './reference-rewriter.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/reference-rewriter.ts`:

```ts
import ts from 'typescript';

export interface SpecifierMatch { start: number; end: number; specifier: string; }
export interface ReferenceRewriter {
  canHandle(file: string): boolean;
  findReferences(sourceFile: string, content: string): SpecifierMatch[];
  rewrite(content: string, matches: SpecifierMatch[], newSpecifierFor: (match: SpecifierMatch) => string | undefined): string;
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function literalMatch(node: ts.StringLiteralLike): SpecifierMatch {
  return { start: node.getStart() + 1, end: node.getEnd() - 1, specifier: node.text };
}

export const jsTsReferenceRewriter: ReferenceRewriter = {
  canHandle(file) { return /\.(?:js|jsx|ts|tsx|mjs|cjs)$/i.test(file); },
  findReferences(sourceFile, content) {
    const source = ts.createSourceFile(sourceFile, content, ts.ScriptTarget.Latest, true, scriptKindFor(sourceFile));
    const matches: SpecifierMatch[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        matches.push(literalMatch(node.moduleSpecifier));
      } else if (ts.isCallExpression(node)) {
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        const isDynamicImport = ts.isImportCall(node);
        if ((isRequire || isDynamicImport) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
          matches.push(literalMatch(node.arguments[0] as ts.StringLiteralLike));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return matches.sort((a, b) => a.start - b.start);
  },
  rewrite(content, matches, newSpecifierFor) {
    let result = ''; let cursor = 0;
    for (const match of matches) {
      const replacement = newSpecifierFor(match);
      if (replacement === undefined) continue;
      result += content.slice(cursor, match.start) + replacement;
      cursor = match.end;
    }
    result += content.slice(cursor);
    return result;
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test -- reference-rewriter.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/reference-rewriter.ts packages/core/src/reference-rewriter.test.ts
git commit -m "feat(core): add ReferenceRewriter with a real TypeScript-AST implementation"
```

---

### Task 2: `refactor-operations.ts` — AST-based, transactional, PHP-gated `rewriteReferences`

**Files:**
- Modify: `packages/core/src/refactor-operations.ts` (full file — `rewriteReferences` replaced; MOVE/RENAME and CONSOLIDATE branches of `applyRefactorOperation` gain try/catch rollback and PHP pre-flight checks)
- Modify: `packages/core/src/refactor-operations.test.ts` (new PHP-gating tests)
- Create: `packages/core/src/refactor-operations-transactional.test.ts` (new file — the one sanctioned `vi.mock` test, isolated so it can't affect any other test file)

**Interfaces:**
- Consumes: `jsTsReferenceRewriter` from Task 1 (`./reference-rewriter.js`).
- Produces: `rewriteReferences` keeps its existing return shape `{ changed: string[]; before: Map<string, string> }` — no change to callers outside this file. `applyRefactorOperation`'s public signature is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/refactor-operations.test.ts`, as a new `describe` block appended at the end of the file (after the existing `describe('safety engine on every operation kind', ...)` block's closing `});`):

```ts
describe('PHP gating -- no auto-rewrite for PHP, ever', () => {
  it('blocks moving a .php file outright, touching nothing', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-php-'));
    writeFileSync(join(target, 'legacy.php'), '<?php\necho "hi";\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move php', source: 'legacy.php', destination: 'moved.php', updateImports: true }))
      .toThrow(/BLOCK: PHP files cannot be moved automatically/);
    expect(existsSync(join(target, 'legacy.php'))).toBe(true);
    expect(existsSync(join(target, 'moved.php'))).toBe(false);
  });

  it('requires supervision when a .php file appears to reference the module being moved', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-php-'));
    writeFileSync(join(target, 'helper.ts'), 'export const helper = () => 1;\n');
    const phpContent = "<?php\n// see also helper for related logic\n";
    writeFileSync(join(target, 'legacy.php'), phpContent);
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move helper', source: 'helper.ts', destination: 'moved/helper.ts', updateImports: true }))
      .toThrow(/SUPERVISED: 1 PHP file\(s\) may reference this module/);
    expect(readFileSync(join(target, 'legacy.php'), 'utf8')).toBe(phpContent);
    expect(existsSync(join(target, 'helper.ts'))).toBe(true);
  });

  it('still allows a JS/TS-only move with no PHP involvement at all', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-php-'));
    writeFileSync(join(target, 'helper.ts'), 'export const helper = () => 1;\n');
    applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move helper', source: 'helper.ts', destination: 'moved/helper.ts', updateImports: true });
    expect(existsSync(join(target, 'moved/helper.ts'))).toBe(true);
    expect(existsSync(join(target, 'helper.ts'))).toBe(false);
  });

  it('rolls back already-rewritten importer files if the final rename fails', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-transactional-'));
    writeFileSync(join(target, 'moved.ts'), 'export const value = 1;\n');
    const importerBefore = "import { value } from './moved';\nconsole.log(value);\n";
    writeFileSync(join(target, 'importer.ts'), importerBefore);
    // 'blocked' already exists as a plain FILE, so mkdirSync(dirname(destination), { recursive: true })
    // genuinely throws (a real, portable filesystem failure -- not a mock) once rewriteReferences
    // has already succeeded and rewritten importer.ts.
    writeFileSync(join(target, 'blocked'), 'not a directory');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'moved.ts', destination: 'blocked/moved.ts', updateImports: true })).toThrow();
    expect(readFileSync(join(target, 'importer.ts'), 'utf8')).toBe(importerBefore);
    expect(existsSync(join(target, 'moved.ts'))).toBe(true);
  });
});
```

This test file already imports `mkdtempSync`, `writeFileSync`, `readFileSync`, `existsSync`, `join`, `tmpdir`, `describe`/`expect`/`it`, and `applyRefactorOperation` (confirm against the file's existing top-of-file imports; if any of these specific names aren't already imported there, add them to the existing import statements rather than introducing a second import line for the same module).

Create `packages/core/src/refactor-operations-transactional.test.ts` (the one deliberate mock, isolated to this file only):

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// This file is the one deliberate exception to this codebase's no-mocking convention.
// A mid-write failure (file 2 of 3 fails to write, after file 1 already succeeded) has
// no portable, organic way to trigger for real without OS-specific permission tricks
// that would be flaky across platforms. This mock is scoped to this file only -- no
// other test file imports refactor-operations.ts through this mocked module graph.
vi.mock('./fs-atomic.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fs-atomic.js')>();
  let callCount = 0;
  return {
    ...actual,
    atomicWrite: (file: string, content: string) => {
      callCount += 1;
      if (callCount === 2) throw new Error('simulated write failure');
      return actual.atomicWrite(file, content);
    }
  };
});

const { applyRefactorOperation } = await import('./refactor-operations.js');

describe('transactional rewrite -- simulated mid-write failure', () => {
  it('restores every already-written file when one write fails partway through, leaving zero net disk change', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-transactional-mock-'));
    writeFileSync(join(target, 'moved.ts'), 'export const value = 1;\n');
    const aBefore = "import { value } from './moved';\nconsole.log('a', value);\n";
    const bBefore = "import { value } from './moved';\nconsole.log('b', value);\n";
    writeFileSync(join(target, 'a.ts'), aBefore);
    writeFileSync(join(target, 'b.ts'), bBefore);
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'moved.ts', destination: 'moved2.ts', updateImports: true })).toThrow('simulated write failure');
    expect(readFileSync(join(target, 'a.ts'), 'utf8')).toBe(aBefore);
    expect(readFileSync(join(target, 'b.ts'), 'utf8')).toBe(bBefore);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations.test.ts refactor-operations-transactional.test.ts`
Expected: FAIL — the PHP-gating tests fail because no PHP check exists yet (a `.php` file is currently just silently never matched by the old regex, so MOVE succeeds instead of throwing); the transactional-mock test fails because today's `rewriteReferences` writes as it goes with no rollback, so after the simulated failure `a.ts` is already rewritten (not restored).

- [ ] **Step 3: Replace `rewriteReferences` and update `applyRefactorOperation`'s MOVE/RENAME/CONSOLIDATE branches**

In `packages/core/src/refactor-operations.ts`, add to the import list at the top (currently `import ts from 'typescript';` and others):

```ts
import { jsTsReferenceRewriter } from './reference-rewriter.js';
```

Delete the line `const importSpecifierPattern = /\b(?:from\s*|export\s+(?:type\s+)?[^;]*?\sfrom\s*|import\s*\(\s*|require\s*\(\s*)(["'])([^"']+)\1/g;` (current line ~70).

Replace the entire `rewriteReferences` function (current line 73, the one-liner starting `function rewriteReferences(root: string, source: string, destination: string): { changed: string[]; before: Map<string, string> } { ... }`) with:

```ts
function rewriteReferences(root: string, source: string, destination: string): { changed: string[]; before: Map<string, string> } {
  const sourceAbs = resolve(root, source); const destinationAbs = resolve(root, destination); const configured = aliases(root);
  const pending: Array<{ file: string; content: string; newContent: string }> = [];
  const phpReferencers: string[] = [];
  const moduleName = basename(sourceAbs).replace(/\.(?:[cm]?js|jsx|tsx?|php)$/i, '');
  for (const file of walk(root)) {
    if (resolve(file) === sourceAbs) continue;
    const content = readFileSync(file, 'utf8');
    if (!jsTsReferenceRewriter.canHandle(file)) {
      // A non-JS/TS file cannot be verified as referencing the moved module without a
      // real parser for its language. A substring check is deliberately over-inclusive
      // (a false positive only costs an extra manual review; a false negative would let
      // a real reference go silently unrewritten) -- see the spec's Part B.
      if (content.includes(moduleName)) phpReferencers.push(relative(root, file));
      continue;
    }
    const matches = jsTsReferenceRewriter.findReferences(file, content);
    if (!matches.length) continue;
    const newContent = jsTsReferenceRewriter.rewrite(content, matches, (match) => {
      const resolved = resolveImport(file, match.specifier, root, configured);
      return resolved && sameModule(resolved, sourceAbs) ? relativeSpecifier(file, destinationAbs, match.specifier) : undefined;
    });
    if (newContent !== content) pending.push({ file, content, newContent });
  }
  if (phpReferencers.length) throw new Error(`SUPERVISED: ${phpReferencers.length} PHP file(s) may reference this module and cannot be automatically verified: ${phpReferencers.join(', ')}. Review and update them manually, then re-run with the appropriate approval.`);
  const moved = readFileSync(sourceAbs, 'utf8');
  const movedMatches = jsTsReferenceRewriter.findReferences(sourceAbs, moved);
  let movedNew = moved; let internalChanged = false;
  if (movedMatches.length) {
    movedNew = jsTsReferenceRewriter.rewrite(moved, movedMatches, (match) => {
      const resolved = resolveImport(sourceAbs, match.specifier, root, configured);
      if (!resolved) { if (match.specifier.startsWith('.')) throw new Error(`BLOCK: cannot resolve internal import ${match.specifier} in ${source}`); return undefined; }
      return relativeSpecifier(destinationAbs, resolved, match.specifier);
    });
    internalChanged = movedNew !== moved;
  }
  const before = new Map<string, string>(); const written: string[] = [];
  try {
    for (const item of pending) { atomicWrite(item.file, item.newContent); before.set(item.file, item.content); written.push(item.file); }
    if (internalChanged) { atomicWrite(sourceAbs, movedNew); before.set(sourceAbs, moved); written.push(sourceAbs); }
  } catch (error) {
    for (const file of written) atomicWrite(file, before.get(file)!);
    throw error;
  }
  return { changed: pending.map((item) => relative(root, item.file)), before };
}
```

Add `basename` to the existing `import { dirname, extname, relative, resolve } from 'node:path';` line, making it `import { basename, dirname, extname, relative, resolve } from 'node:path';`.

In `applyRefactorOperation`'s MOVE/RENAME branch (the line beginning `if (operation.kind === 'MOVE' || operation.kind === 'RENAME') { ... }`), insert a PHP pre-flight check immediately after the existing `if (existsSync(destination)) throw ...;` check and before the `assessRefactorSafety` call, and wrap the `mkdirSync`+`renameSync` pair in a try/catch that restores `ref.before` on failure. The branch becomes:

```ts
if (operation.kind === 'MOVE' || operation.kind === 'RENAME') {
  const source = resolve(root, operation.source); const destination = resolve(root, operation.destination);
  if (!existsSync(source)) throw new Error(`Source does not exist: ${operation.source}`);
  if (existsSync(destination)) throw new Error(`Destination already exists: ${operation.destination}`);
  if (extname(source) === '.php') throw new Error('BLOCK: PHP files cannot be moved automatically; no verifiable reference rewriter exists for PHP includes/requires yet. Move it manually and update references by hand.');
  const contents = new Map(walk(root).map((file) => [file, readFileSync(file, 'utf8')]));
  const safety = assessRefactorSafety([source], contents);
  if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`);
  if (publicEntryPoints(root).has(source)) throw new Error('BLOCKED: this file is a public package entry point (main/module/exports/bin/types); moving it would change a public contract.');
  if (isReExported(root, operation.source)) throw new Error('BLOCKED: this file is re-exported (export * / export { X } from) elsewhere; moving it would change a public contract.');
  const ref = operation.updateImports ? rewriteReferences(root, operation.source, operation.destination) : { changed: [], before: new Map<string, string>() };
  try {
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
  } catch (error) {
    for (const [file, content] of ref.before) atomicWrite(file, content);
    throw error;
  }
  return { operationId: id, changedFiles: [...new Set([...ref.changed, operation.source, operation.destination])], description: operation.description, relatedTestFiles: [], undo: () => { if (existsSync(destination)) renameSync(destination, source); for (const [file, content] of ref.before) atomicWrite(file, content); } };
}
```

In the `CONSOLIDATE` branch, insert a PHP pre-flight check for `duplicate` right after resolving `canonical`/`duplicate`, and wrap the `unlinkSync(duplicate)` call in a try/catch that restores `ref.before` on failure:

```ts
if (operation.kind === 'CONSOLIDATE') {
  const canonical = resolve(root, operation.canonicalFile); const duplicate = resolve(root, operation.duplicateFile);
  if (extname(duplicate) === '.php') throw new Error('BLOCK: PHP files cannot be consolidated automatically; no verifiable reference rewriter exists for PHP includes/requires yet.');
  const canonicalText = readFileSync(canonical, 'utf8'); const duplicateText = readFileSync(duplicate, 'utf8');
  const safety = assessRefactorSafety([canonical, duplicate], new Map([[canonical, canonicalText], [duplicate, duplicateText]]));
  if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`);
  if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`);
  const publicEntries = publicEntryPoints(root);
  if (publicEntries.has(canonical) || publicEntries.has(duplicate)) throw new Error('BLOCKED: one of these files is a public package entry point (main/exports/bin/types); consolidating would change a public contract.');
  if (isReExported(root, operation.duplicateFile)) throw new Error('BLOCKED: the duplicate file is re-exported (export * / export { X } from) elsewhere; consolidating would change a public contract.');
  if (canonicalText.replace(/\s/g, '') !== duplicateText.replace(/\s/g, '')) throw new Error('SUPERVISED: files are not exact duplicates.');
  const ref = rewriteReferences(root, operation.duplicateFile, operation.canonicalFile);
  try { unlinkSync(duplicate); } catch (error) { for (const [file, content] of ref.before) atomicWrite(file, content); throw error; }
  return { operationId: id, changedFiles: [...ref.changed, operation.duplicateFile], description: operation.description, relatedTestFiles: [], undo: () => { atomicWrite(duplicate, duplicateText); for (const [file, content] of ref.before) atomicWrite(file, content); } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations.test.ts refactor-operations-transactional.test.ts reference-rewriter.test.ts refactor-executor.test.ts`
Expected: PASS across all four files. `refactor-executor.test.ts`'s existing `describe('import resolution during MOVE', ...)` tests (aliases, `.js`→`.ts` resolution, `require()`/dynamic `import()` rewriting, dynamic-non-literal-left-untouched, barrel-re-export blocking) must continue to pass **unmodified** — they prove the AST rewrite preserves every existing correct behavior. If any of them fails, the failure names a real behavioral gap in the new AST implementation (not a test to relax) — investigate and fix `reference-rewriter.ts` or the call site in `rewriteReferences`, not the test.

- [ ] **Step 5: Full core test suite and typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test`
Expected: no errors; every test passes.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/refactor-operations.ts packages/core/src/refactor-operations.test.ts packages/core/src/refactor-operations-transactional.test.ts
git commit -m "feat(core): make rewriteReferences AST-based and transactional, gate PHP as SUPERVISED/BLOCKED"
```

---

### Task 3: `ycf move` becomes a one-block-plan wrapper around `executeRefactorPlan`

**Files:**
- Modify: `packages/cli/src/index.ts` (delete `rewriteImportsForMove`/`relativeImport` and the `move` command's own checkpoint/verify wiring; rebuild `move` on `executeRefactorPlan`)

**Interfaces:**
- Consumes: `executeRefactorPlan`, `ArchitecturalRefactorPlan` type (already exported from `@jotaese68/core`'s barrel — `executeRefactorPlan` is already imported in this file; `ArchitecturalRefactorPlan` needs adding to the type-only portion of the import, or a separate `import type` line).

- [ ] **Step 1: Delete the old implementation**

Delete `relativeImport` (current lines 361-364) and `rewriteImportsForMove` (current lines 366-385) from `packages/cli/src/index.ts` entirely.

- [ ] **Step 2: Rewrite the `move` command**

Replace the entire `move` command registration (current lines 387-410) with:

```ts
program.command('move <source> <destination> [target]').description('Move one module with import updates, checkpoint and verification.').option('--dry-run', 'Show the planned move without changing files.').option('--yes', 'Approve the move after reviewing the plan.').action((source, destination, target = '.', options) => {
  const sourcePath = resolve(target, source);
  const destinationPath = resolve(target, destination);
  if (!existsSync(sourcePath)) throw new Error(`Source module does not exist: ${source}`);
  if (existsSync(destinationPath)) throw new Error(`Destination already exists: ${destination}`);
  console.log(`Planned structural move: ${source} → ${destination}`);
  console.log('YCF will update static import paths, create a checkpoint, verify, and rollback on failure.');
  if (options.dryRun || !options.yes) { console.log('No files changed. Re-run with --yes after reviewing the plan.'); return; }
  const plan: ArchitecturalRefactorPlan = {
    version: 2, target: resolve(target), generatedAt: new Date().toISOString(),
    blocks: [{
      id: 'CLI-MOVE', type: 'MOVE', goal: `Move ${source} to ${destination}`, reason: 'Explicit ycf move command.',
      risk: 'LOW', confidence: 99, evidence: [], confidenceTier: 'CONFIRMED', mode: 'SAFE',
      files: [source], dependencies: [], affectedModules: [], preconditions: [],
      operations: [{ id: 'op-move', kind: 'MOVE', description: `Move ${source} to ${destination}`, source, destination, updateImports: true }],
      validation: [], rollback: [], status: 'PLANNED'
    }],
    summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, sourceFindings: []
  };
  const result = executeRefactorPlan(target, plan, { fullVerify: true });
  const block = result.blocks[0];
  if (result.keptBlocks.includes('CLI-MOVE')) {
    console.log(`Move complete. ${block.result?.changedFiles.length ?? 0} file(s) changed (moved file + updated imports).`);
    console.log(`Run id: ${result.runId ?? 'unknown'} (use \`ycf recover\` to inspect or restore).`);
    console.log(gitDiffSummary(target));
    return;
  }
  if (result.rolledBackBlocks.includes('CLI-MOVE')) {
    console.error(`Move failed: ${block.result?.error ?? 'unknown error'}`);
    if (block.result?.verification) printFailedChecks(block.result.verification as ReturnType<typeof verify>);
    process.exitCode = 1;
    return;
  }
  console.error(block.result?.error ?? 'Move blocked or requires supervised approval.');
  process.exitCode = 1;
});
```

Add `ArchitecturalRefactorPlan` to the CLI's import from `@jotaese68/core` (current line 9's giant destructured import) as a type-only addition — either add `type ArchitecturalRefactorPlan` inline to the existing named-import list (commander/TypeScript allow mixing `type X` inside a single `import { ... }` from a package that re-exports both values and types, matching this codebase's existing style elsewhere — confirm against how other `type`-only names already appear in that same import line before choosing the exact syntax) or add a separate `import type { ArchitecturalRefactorPlan } from '@jotaese68/core';` line — either is acceptable, pick whichever matches this file's existing convention once you've read the current import line.

- [ ] **Step 3: Manual smoke test**

Build and run against a disposable fixture (not this repo) to confirm the rewritten command behaves correctly end-to-end:

```bash
corepack pnpm --filter @jotaese68/core build && corepack pnpm --filter @jotaese68/ycf build
```

Then, in a scratch directory with two files and a real import between them (a real Git repo, since `executeRefactorPlan`'s checkpoint journal requires one — `git init` + an initial commit first), run `node packages/cli/dist/index.js move <source> <destination> <scratch-repo> --yes` and confirm the file moved and the import was rewritten. Record the real output in the task report.

- [ ] **Step 4: Typecheck both packages**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core build && corepack pnpm --filter @jotaese68/ycf typecheck`
Expected: no errors. Confirm `rewriteImportsForMove` and `relativeImport` no longer appear anywhere in `packages/cli/src/index.ts` (a simple search, not a formal test).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): rebuild ycf move as a one-block plan on the shared executeRefactorPlan engine"
```

---

### Task 4: `RefactorExecutionReport` exposes `runId`

**Files:**
- Modify: `packages/core/src/refactor-types.ts` (`RefactorExecutionReport`, ~line 32-36)
- Modify: `packages/core/src/refactor-executor.ts` (`executeRefactorPlan`, ~lines 21-40)
- Modify: `packages/core/src/refactor-executor.test.ts` (one new assertion)

**Interfaces:**
- Produces: `RefactorExecutionReport.runId?: string`. Tasks 6 and 7 both read this field.

- [ ] **Step 1: Write the failing test**

Add to the existing `it('persists one Git checkpoint record per block', ...)` test in `packages/core/src/refactor-executor.test.ts` (current lines 54-64), immediately after the existing `expect(journal?.blocks.every((item) => item.ref && item.commit)).toBe(true);` line, add:

```ts
    expect(result.runId).toBe(journal?.runId);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-executor.test.ts`
Expected: FAIL — `result.runId` is `undefined`, `journal?.runId` is a real string.

- [ ] **Step 3: Expose `runId`**

In `packages/core/src/refactor-types.ts`, add `runId?: string;` to `RefactorExecutionReport` (current lines 32-35):

```ts
export interface RefactorExecutionReport {
  version: 2; target: string; startedAt: string; completedAt: string; status: 'planned' | 'completed' | 'partial' | 'failed';
  runId?: string;
  blocks: RefactorBlock[]; keptBlocks: string[]; rolledBackBlocks: string[]; blockedBlocks: string[]; operationLog: OperationRecord[]; rollbackEvents: RollbackEvent[];
  before?: { files: string[]; architecture?: UnderstandReport['graph'] }; after?: { files: string[]; architecture?: UnderstandReport['graph'] };
}
```

In `packages/core/src/refactor-executor.ts`, the final `return` statement of `executeRefactorPlan` (current line 40, `return { version: 2, target: root, startedAt, completedAt: new Date().toISOString(), status, blocks: plan.blocks, keptBlocks, rolledBackBlocks, blockedBlocks, operationLog, rollbackEvents, before: {...}, after: {...} };`) gains `runId: checkpoints?.journal.runId,` — insert it right after `status,`:

```ts
  return { version: 2, target: root, startedAt, completedAt: new Date().toISOString(), status, runId: checkpoints?.journal.runId, blocks: plan.blocks, keptBlocks, rolledBackBlocks, blockedBlocks, operationLog, rollbackEvents, before: { files: beforeFiles, architecture: beforeArchitecture }, after: { files: sourceSnapshot(root), architecture: architectureSnapshot(root) } };
```

(`checkpoints` is already the local variable holding the result of `beginCheckpointJournal(...)`, assigned earlier in the function at current line 23 — it is `CheckpointContext | undefined`, and `CheckpointContext.journal.runId` is the string this task exposes; `checkpoints?.journal.runId` is `undefined` exactly when `options.createGitCheckpoint === false`, matching the field's optional type.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-executor.test.ts`
Expected: PASS.

- [ ] **Step 5: Full core test suite and typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test`
Expected: no errors; every test passes (confirms nothing else broke from the new required-shape addition — `runId` is optional, so no other `RefactorExecutionReport`-constructing test literal needs updating).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/refactor-types.ts packages/core/src/refactor-executor.ts packages/core/src/refactor-executor.test.ts
git commit -m "feat(core): expose runId on RefactorExecutionReport"
```

---

### Task 5: `refactor-checkpoints.ts` — archived-run lookup

**Files:**
- Modify: `packages/core/src/refactor-checkpoints.ts` (add `findArchivedBlock`, `findBlockByIdAcrossRuns`; extend `markBlockRolledBack` with an optional `runId` parameter)
- Test: `packages/core/src/refactor-checkpoints.test.ts` (new file — no dedicated test file exists for this module today; it has only been exercised indirectly through `refactor-executor.test.ts` and `recover.test.ts`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `findArchivedBlock(target: string, runId: string, blockId: string): PersistentBlockCheckpoint | undefined`, `findBlockByIdAcrossRuns(target: string, blockId: string): { runId: string; block: PersistentBlockCheckpoint } | undefined` (returns `undefined` for zero OR more-than-one match — never guesses), `markBlockRolledBack(target: string, blockId: string, runId?: string): void` (extended signature — when `runId` is given and does not match the current journal's own `runId`, writes back to that archived run's file only, not `currentPath`). Task 6 consumes all three.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/refactor-checkpoints.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { beginCheckpointJournal, findArchivedBlock, findBlockByIdAcrossRuns, markBlockRolledBack, readCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';

function initGit(root: string) {
  const runGit = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  runGit(['init', '-q']); runGit(['config', 'user.email', 'ycf-test@example.com']); runGit(['config', 'user.name', 'YCF Test']);
  writeFileSync(join(root, '.gitignore'), '.ycf\n'); runGit(['add', '.gitignore']); runGit(['commit', '-qm', 'gitignore']);
  return runGit;
}

describe('findArchivedBlock', () => {
  it('finds a block by its exact runId, even after a later run has become current', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-archive-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target); runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(target, ['RF-FIRST']);
    updateBlockCheckpoint(first, 'RF-FIRST', 'VERIFIED', { changedFiles: ['source.ts'], operationIds: ['op-1'] });
    const firstRunId = first!.journal.runId;
    beginCheckpointJournal(target, ['RF-SECOND']); // supersedes "current"
    expect(readCheckpointJournal(target)?.blocks[0].blockId).toBe('RF-SECOND');
    const found = findArchivedBlock(target, firstRunId, 'RF-FIRST');
    expect(found?.blockId).toBe('RF-FIRST');
    expect(found?.status).toBe('VERIFIED');
  });

  it('returns undefined for an unknown runId or blockId', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-archive-'));
    expect(findArchivedBlock(target, 'run-does-not-exist', 'RF-X')).toBeUndefined();
  });
});

describe('findBlockByIdAcrossRuns', () => {
  it('returns undefined when no archived run contains the blockId', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-archive-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    initGit(target);
    expect(findBlockByIdAcrossRuns(target, 'RF-NOWHERE')).toBeUndefined();
  });

  it('finds the block when exactly one archived run contains it', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-archive-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target); runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(target, ['RF-UNIQUE']);
    updateBlockCheckpoint(first, 'RF-UNIQUE', 'VERIFIED');
    beginCheckpointJournal(target, ['RF-OTHER']);
    const found = findBlockByIdAcrossRuns(target, 'RF-UNIQUE');
    expect(found?.runId).toBe(first!.journal.runId);
    expect(found?.block.blockId).toBe('RF-UNIQUE');
  });

  it('refuses to guess when the same blockId exists in two different archived runs', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-archive-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target); runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(target, ['RF-DUP']);
    updateBlockCheckpoint(first, 'RF-DUP', 'VERIFIED');
    const second = beginCheckpointJournal(target, ['RF-DUP']);
    updateBlockCheckpoint(second, 'RF-DUP', 'VERIFIED');
    expect(findBlockByIdAcrossRuns(target, 'RF-DUP')).toBeUndefined();
  });
});

describe('markBlockRolledBack with an explicit runId', () => {
  it('writes back to the archived run file, not the current journal, when runId is not current', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-archive-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target); runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(target, ['RF-FIRST']);
    updateBlockCheckpoint(first, 'RF-FIRST', 'VERIFIED');
    const firstRunId = first!.journal.runId;
    beginCheckpointJournal(target, ['RF-SECOND']);
    markBlockRolledBack(target, 'RF-FIRST', firstRunId);
    expect(findArchivedBlock(target, firstRunId, 'RF-FIRST')?.status).toBe('ROLLED_BACK');
    expect(readCheckpointJournal(target)?.blocks[0].blockId).toBe('RF-SECOND'); // current journal untouched
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-checkpoints.test.ts`
Expected: FAIL — `findArchivedBlock`/`findBlockByIdAcrossRuns` don't exist yet; `markBlockRolledBack` doesn't accept a third argument yet (TypeScript will actually fail to compile this test file until the signature changes — that compile failure is the expected RED state here, not a runtime assertion failure).

- [ ] **Step 3: Implement**

In `packages/core/src/refactor-checkpoints.ts`, add `readdirSync` to the existing `node:fs` import (currently `import { existsSync, mkdirSync, readFileSync } from 'node:fs';`), making it `import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';`.

Add, after `readCheckpointJournal` (current lines 42-45):

```ts
function readJournalFile(path: string): PersistentCheckpointJournal | undefined {
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')) as PersistentCheckpointJournal; } catch { return undefined; }
}

export function findArchivedBlock(target: string, runId: string, blockId: string): PersistentBlockCheckpoint | undefined {
  const path = join(resolve(target), '.ycf', 'refactor-checkpoints', `${runId}.json`);
  return readJournalFile(path)?.blocks.find((entry) => entry.blockId === blockId);
}

export function findBlockByIdAcrossRuns(target: string, blockId: string): { runId: string; block: PersistentBlockCheckpoint } | undefined {
  const dir = join(resolve(target), '.ycf', 'refactor-checkpoints');
  if (!existsSync(dir)) return undefined;
  const matches: Array<{ runId: string; block: PersistentBlockCheckpoint }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const journal = readJournalFile(join(dir, file));
    const block = journal?.blocks.find((entry) => entry.blockId === blockId);
    if (journal && block) matches.push({ runId: journal.runId, block });
  }
  return matches.length === 1 ? matches[0] : undefined;
}
```

Replace the existing `markBlockRolledBack` (current lines 47-59):

```ts
export function markBlockRolledBack(target: string, blockId: string): void {
  const journal = readCheckpointJournal(target);
  if (!journal) return;
  const block = journal.blocks.find((entry) => entry.blockId === blockId);
  if (!block) return;
  const now = new Date().toISOString();
  block.status = 'ROLLED_BACK'; block.updatedAt = now;
  journal.updatedAt = now;
  const root = resolve(target); const output = join(root, '.ycf'); const archive = join(output, 'refactor-checkpoints');
  const currentPath = join(output, 'refactor-checkpoints.json'); const path = join(archive, `${journal.runId}.json`);
  const serialized = `${JSON.stringify(journal, null, 2)}\n`;
  atomicWrite(path, serialized); atomicWrite(currentPath, serialized);
}
```

with:

```ts
export function markBlockRolledBack(target: string, blockId: string, runId?: string): void {
  const root = resolve(target); const output = join(root, '.ycf'); const archive = join(output, 'refactor-checkpoints');
  const currentPath = join(output, 'refactor-checkpoints.json');
  const current = readCheckpointJournal(target);
  if (!runId || current?.runId === runId) {
    if (!current) return;
    const block = current.blocks.find((entry) => entry.blockId === blockId);
    if (!block) return;
    const now = new Date().toISOString(); block.status = 'ROLLED_BACK'; block.updatedAt = now; current.updatedAt = now;
    const serialized = `${JSON.stringify(current, null, 2)}\n`;
    atomicWrite(join(archive, `${current.runId}.json`), serialized); atomicWrite(currentPath, serialized);
    return;
  }
  const path = join(archive, `${runId}.json`);
  const journal = readJournalFile(path);
  const block = journal?.blocks.find((entry) => entry.blockId === blockId);
  if (!journal || !block) return;
  const now = new Date().toISOString(); block.status = 'ROLLED_BACK'; block.updatedAt = now; journal.updatedAt = now;
  atomicWrite(path, `${JSON.stringify(journal, null, 2)}\n`);
}
```

(The archived-run branch deliberately never writes `currentPath` — that file must keep reflecting whichever run is genuinely current, per the test above.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-checkpoints.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full core test suite and typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test`
Expected: no errors; every test passes (confirms `markBlockRolledBack`'s existing caller in `recover.ts` still compiles with the new optional third parameter — it does, since the parameter is optional and the existing 2-argument call site is unaffected).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/refactor-checkpoints.ts packages/core/src/refactor-checkpoints.test.ts
git commit -m "feat(core): add archived-run lookup to the checkpoint journal for cross-run rollback"
```

---

### Task 6: `rollbackExecution` — persistent rollback, current-journal-first with archived-run fallback

**Files:**
- Modify: `packages/core/src/recover.ts` (`restoreBlock` renamed to `rollbackExecution`, gains a `runId` parameter)
- Modify: `packages/core/src/recover.test.ts` (update existing `restoreBlock` calls to the new name/signature; add fallback-lookup tests)
- Modify: `packages/core/src/index.ts` (barrel: rename export)
- Modify: `packages/cli/src/index.ts` (`recover` command's internal call site — public `--restore <blockId>` CLI surface is unchanged)

**Interfaces:**
- Consumes: `findArchivedBlock`, `findBlockByIdAcrossRuns` from Task 5.
- Produces: `rollbackExecution(target: string, runId: string | undefined, blockId: string): RestoreResult` (replaces `restoreBlock(target: string, blockId: string): RestoreResult` — `RestoreResult`'s shape is unchanged). Task 7 consumes this directly with a real `runId`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/recover.test.ts`, rename every call to `restoreBlock(target, blockId)` to `rollbackExecution(target, undefined, blockId)` (the existing tests all only ever knew a blockId, matching the CLI's own always-omits-runId usage — `undefined` for `runId` preserves their exact original meaning) and update the import line from `import { recover, restoreBlock } from './recover.js';` to `import { recover, rollbackExecution } from './recover.js';`.

Then add two new tests, appended at the end of the `describe('restoreBlock', ...)` block (rename this `describe` to `describe('rollbackExecution', ...)`):

```ts
  it('restores a block from an archived run when given its exact runId, even though a newer run is current', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    const file = join(target, 'source.ts');
    writeFileSync(file, 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(target, ['RF-FIRST']);
    updateBlockCheckpoint(first, 'RF-FIRST', 'RUNNING');
    const firstRunId = first!.journal.runId;
    writeFileSync(file, 'export const value = 2;\n');
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'first change']);
    beginCheckpointJournal(target, ['RF-SECOND']); // RF-FIRST is now archived, not current
    const result = rollbackExecution(target, firstRunId, 'RF-FIRST');
    expect(result.restored).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('export const value = 1;\n');
  });

  it('falls back to searching archived runs by blockId alone when runId is not given', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    const file = join(target, 'source.ts');
    writeFileSync(file, 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(target, ['RF-ONLY']);
    updateBlockCheckpoint(first, 'RF-ONLY', 'RUNNING');
    writeFileSync(file, 'export const value = 2;\n');
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'first change']);
    beginCheckpointJournal(target, ['RF-SECOND']);
    const result = rollbackExecution(target, undefined, 'RF-ONLY');
    expect(result.restored).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('export const value = 1;\n');
  });
```

Add `beginCheckpointJournal`, `updateBlockCheckpoint` to the existing import from `./refactor-checkpoints.js` if not already imported (the file already imports these per Task 4's/P1's prior work — confirm against the actual current import line and extend it if anything is missing rather than adding a duplicate import statement).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- recover.test.ts`
Expected: FAIL to compile — `rollbackExecution` doesn't exist yet, `restoreBlock` still does.

- [ ] **Step 3: Implement**

Replace `packages/core/src/recover.ts`'s `restoreBlock` function (current lines 9-22) — keep `RestoreResult`'s type declaration and `recover`/`RecoverReport` completely unchanged, replace only the function itself and its import line:

```ts
import { readCheckpointJournal, findArchivedBlock, findBlockByIdAcrossRuns, markBlockRolledBack, type PersistentCheckpointJournal } from './refactor-checkpoints.js';
import { rollbackToCheckpoint } from './git.js';

export interface RecoverReport { target: string; journal?: PersistentCheckpointJournal; }
export function recover(target: string): RecoverReport {
  return { target, journal: readCheckpointJournal(target) };
}

export type RestoreResult = { restored: true; blockId: string; commit: string } | { restored: false; reason: string };
export function rollbackExecution(target: string, runId: string | undefined, blockId: string): RestoreResult {
  const current = readCheckpointJournal(target);
  const inCurrent = current?.blocks.find((entry) => entry.blockId === blockId);
  const resolvedRunId = runId ?? current?.runId;
  let block = (!runId || current?.runId === runId) ? inCurrent : undefined;
  if (!block && runId) block = findArchivedBlock(target, runId, blockId);
  let effectiveRunId = block ? resolvedRunId : undefined;
  if (!block && !runId) {
    const found = findBlockByIdAcrossRuns(target, blockId);
    if (found) { block = found.block; effectiveRunId = found.runId; }
  }
  if (!block) return { restored: false, reason: `No block "${blockId}" in the checkpoint journal or any archived run.` };
  if (!block.ref || !block.commit) return { restored: false, reason: `Block "${blockId}" has no recorded checkpoint ref to restore to.` };
  try {
    rollbackToCheckpoint(target, { ref: block.ref, commit: block.commit, createdAt: block.startedAt ?? block.updatedAt });
  } catch (error) {
    return { restored: false, reason: error instanceof Error ? error.message : String(error) };
  }
  markBlockRolledBack(target, blockId, effectiveRunId);
  return { restored: true, blockId, commit: block.commit };
}
```

- [ ] **Step 4: Update the barrel export**

In `packages/core/src/index.ts`, change (current line 21):

```ts
export { recover, restoreBlock } from './recover.js';
```

to:

```ts
export { recover, rollbackExecution } from './recover.js';
```

(Line 22, `export type { RecoverReport, RestoreResult } from './recover.js';`, is unchanged.)

- [ ] **Step 5: Update the CLI's `recover` command**

In `packages/cli/src/index.ts`, change `restoreBlock` to `rollbackExecution` in the import line (current line 9's giant destructured import), and change the `recover` command's internal call site (current line 692, `const result = restoreBlock(target, options.restore);`) to:

```ts
    const result = rollbackExecution(target, undefined, options.restore);
```

(The public `--restore <blockId>` CLI flag is unchanged — only the internal function name/call changes. The CLI never has a `runId` to pass, matching the existing public surface exactly; the new fallback search happens transparently inside `rollbackExecution`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- recover.test.ts refactor-checkpoints.test.ts`
Expected: PASS.

- [ ] **Step 7: Full verification, both packages**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test && corepack pnpm --filter @jotaese68/core build && corepack pnpm --filter @jotaese68/ycf typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/recover.ts packages/core/src/recover.test.ts packages/core/src/index.ts packages/cli/src/index.ts
git commit -m "feat: rename restoreBlock to rollbackExecution, add archived-run fallback lookup"
```

---

### Task 7: Cockpit Reorganize joins the shared engine

**Files:**
- Modify: `packages/core/src/cockpit.ts` (`/apply/move` and `/undo/move` handlers rewritten; imports updated)
- Delete: `packages/core/src/reorganization.ts`
- Delete: `packages/core/src/reorganization.test.ts` (its scenarios are superseded by the rewritten `cockpit.test.ts` coverage below — the direct-call, no-checkpoint code path it tested no longer exists)
- Modify: `packages/core/src/cockpit.test.ts` (existing reorganization-endpoint tests updated for the new response/internal shape where needed; one new test for cross-run undo)
- Modify: `packages/core/src/index.ts` (barrel: remove `applyReorganizationMove`/`ReorganizationMoveResult` export)

**Interfaces:**
- Consumes: `executeRefactorPlan` (already used elsewhere in this codebase), `rollbackExecution` from Task 6.
- Produces: nothing new — this task is purely a rewiring of an existing HTTP surface; the HTTP request/response shapes for `/apply/move`, `/undo/move`, `/keep/move`, `/finalize`, `/finalize/publish` are unchanged from the outside.

- [ ] **Step 1: Delete the old implementation**

Delete `packages/core/src/reorganization.ts` and `packages/core/src/reorganization.test.ts` entirely.

In `packages/core/src/index.ts`, delete the line (current line 18):

```ts
export { applyReorganizationMove, type ReorganizationMoveResult } from './reorganization.js';
```

- [ ] **Step 2: Write the failing/updated tests**

`packages/core/src/cockpit.test.ts` needs its imports and two handlers' internal expectations updated. The HTTP-level assertions (status codes, response JSON shapes like `{ status: 'applied', changedFiles }`) are **unchanged** — only what happens *inside* the server (checkpoint journal vs. nothing) changes, which is invisible to these HTTP-level tests except for one new scenario below.

Add, at the end of the existing `describe('Cockpit reorganization endpoints', ...)` block (after the last existing `it(...)`, before the block's closing `});`):

```ts
  it('undo/move restores a block that was applied several applies ago in the same session, after a later apply has become "current"', async () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-cockpit-'));
    mkdirSync(join(target, '.ycf'), { recursive: true });
    mkdirSync(join(target, 'legacy'), { recursive: true });
    writeFileSync(join(target, 'legacy/first.ts'), 'export const first = 1;\n');
    writeFileSync(join(target, 'legacy/second.ts'), 'export const second = 2;\n');
    writeFileSync(join(target, '.ycf/reorganization-plan.json'), JSON.stringify({
      version: 2, target, generatedAt: new Date().toISOString(),
      summary: { auto: 0, safeRefactor: 0, supervised: 2, architectural: 0, blocked: 0 }, sourceFindings: [],
      blocks: [
        { id: 'RF-A', type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
          files: ['legacy/first.ts'], dependencies: [], affectedModules: [], preconditions: [],
          operations: [{ id: 'op-a', kind: 'MOVE', description: 'move', source: 'legacy/first.ts', destination: 'features/first.ts', updateImports: true }],
          validation: [], rollback: [], status: 'PLANNED' },
        { id: 'RF-B', type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
          files: ['legacy/second.ts'], dependencies: [], affectedModules: [], preconditions: [],
          operations: [{ id: 'op-b', kind: 'MOVE', description: 'move', source: 'legacy/second.ts', destination: 'features/second.ts', updateImports: true }],
          validation: [], rollback: [], status: 'PLANNED' }
      ]
    }));
    server = startCockpitServer(target, 4405);
    const headers = { 'x-ycf-token': server.token, 'Content-Type': 'application/json' };
    await fetch(`${server.url}/apply/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-A' }) });
    await fetch(`${server.url}/apply/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-B' }) });
    // RF-B's own run is now "current"; RF-A's run has been archived by RF-B's own
    // beginCheckpointJournal call. Undoing RF-A here exercises the cross-run lookup.
    const undoResponse = await fetch(`${server.url}/undo/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-A' }) });
    expect(undoResponse.status).toBe(200);
    expect(existsSync(join(target, 'legacy/first.ts'))).toBe(true);
    expect(existsSync(join(target, 'features/first.ts'))).toBe(false);
    // RF-B's own move must be unaffected by undoing RF-A.
    expect(existsSync(join(target, 'features/second.ts'))).toBe(true);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- cockpit.test.ts`
Expected: FAIL — today's `/apply/move`/`/undo/move` handlers use `applyReorganizationMove`'s in-memory closures with no per-block Git checkpoint journal at all, so RF-A's `undo()` closure genuinely does still work today (it's in the same `appliedMoves` map for the life of the process) — **this specific new test may actually currently pass by accident** on the old implementation, since the in-memory map never actually expires within one test run. Do not treat that as proof the old implementation is fine: the whole point of this task is that the old implementation's undo stops working the moment the process restarts, which this in-process test cannot observe either way. Proceed to Step 4 regardless; this test's real value is guarding the *new* implementation's correctness, and it must still pass afterward.

- [ ] **Step 4: Rewrite `cockpit.ts`'s reorganization handlers**

In `packages/core/src/cockpit.ts`, change the import line (current line 10):

```ts
import { applyReorganizationMove } from './reorganization.js';
```

to:

```ts
import { executeRefactorPlan } from './refactor-executor.js';
import { rollbackExecution } from './recover.js';
```

Change the `appliedMoves` map's type (current line 72):

```ts
const appliedMoves = new Map<string, Extract<ReturnType<typeof applyReorganizationMove>, { status: 'applied' }>>();
```

to:

```ts
const appliedMoves = new Map<string, { runId?: string; changedFiles: string[] }>();
```

Update the doc comment immediately above it (current lines 68-71, which today reads "Per-server-instance only, by design... Undo/Keep only work while this exact process is still running; restarting Cockpit loses this map, but every applied change is already sitting uncommitted in the working tree...") to instead describe the new, actually-persistent behavior:

```ts
  // appliedMoves tracks, per-blockId, the runId + changedFiles from this session's own
  // executeRefactorPlan calls -- enough to render /plan/reorganization's "applied" list
  // and to build a /finalize commit. The durable rollback state itself lives in
  // .ycf/refactor-checkpoints (and its per-run archive), not in this map -- /undo/move
  // works via rollbackExecution even if the Cockpit process restarts between an apply
  // and its undo, because that lookup reads the journal from disk, not this map.
```

Replace the `/apply/move` handler's body (current lines 110-134, from `if (req.method === 'POST' && url.pathname === '/apply/move') {` through its closing `}`):

```ts
    if (req.method === 'POST' && url.pathname === '/apply/move') {
      let body: Record<string, unknown>;
      try { body = await readJsonBody(req); }
      catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid request body' })); return; }
      const blockId = String(body.blockId ?? '');
      const plan = readReorganizationPlan(target);
      const block = plan?.blocks.find((candidate) => candidate.id === blockId);
      if (!block) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'unknown blockId' })); return; }
      if (appliedMoves.has(blockId)) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'already applied this session' })); return; }
      if (block.operations.length !== 1 || !(block.operations[0].kind === 'MOVE' || block.operations[0].kind === 'RENAME')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'block must contain exactly one MOVE or RENAME operation' }));
        return;
      }
      if (!baseline) {
        try { baseline = { score: audit(target).score.fucked, architecture: understand(target).graph }; }
        catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); return; }
      }
      const singleBlockPlan: ArchitecturalRefactorPlan = { version: 2, target, generatedAt: new Date().toISOString(), blocks: [{ ...block, validation: [] }], summary: { auto: 0, safeRefactor: 0, supervised: 1, architectural: 0, blocked: 0 }, sourceFindings: [] };
      const result = executeRefactorPlan(target, singleBlockPlan, { allowSupervised: true, fullVerify: false });
      const executed = result.blocks[0];
      if (result.rolledBackBlocks.includes(blockId)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'rolled_back', error: executed.result?.error ?? 'Verification failed.' })); return; }
      if (!result.keptBlocks.includes(blockId)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'rolled_back', error: executed.result?.error ?? 'Blocked or requires further approval.' })); return; }
      const changedFiles = executed.result?.changedFiles ?? [];
      appliedMoves.set(blockId, { runId: result.runId, changedFiles });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'applied', changedFiles }));
      return;
    }
```

(`{ ...block, validation: [] }` forces the FAST-only verification path inside `runVerification` — `runVerification(target, block, full)` takes the fast branch when `!full && !block.validation.length` — reproducing today's `verifyFast`-only behavior exactly, since the plan JSON's blocks may or may not already have an empty `validation` array and this guarantees it regardless. `allowSupervised: true` is required because every block in `.ycf/reorganization-plan.json` is written with `mode: 'SUPERVISED'` by design (an AI agent proposed it, a human is approving it interactively through this exact endpoint) — matching the existing, unchanged security posture the code comment at the top of this file already documents: "every one of them only ever executes a move that already exists, verbatim, in .ycf/reorganization-plan.json, written by an AI agent after the user approved it in chat.")

Replace the `/undo/move` handler's body (current lines 135-146):

```ts
    if (req.method === 'POST' && url.pathname === '/undo/move') {
      let body: Record<string, unknown>;
      try { body = await readJsonBody(req); }
      catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid request body' })); return; }
      const blockId = String(body.blockId ?? '');
      const applied = appliedMoves.get(blockId);
      if (!applied || keptMoves.has(blockId)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'no undoable applied move with that blockId in this session' })); return; }
      const result = rollbackExecution(target, applied.runId, blockId);
      if (!result.restored) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: result.reason })); return; }
      appliedMoves.delete(blockId);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'pending' })); return;
    }
```

`/keep/move`, `/finalize`, `/finalize/publish` (current lines 147-189) need no code change — they only ever read `appliedMoves.keys()`/`.values().flatMap((entry) => entry.changedFiles)`, and the new map shape still provides both.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- cockpit.test.ts`
Expected: PASS — every existing scenario (apply, undo, keep, malformed body survives, undo-throws survives, finalize, finalize/publish with and without push, the two block-shape rejection tests) plus the new cross-run test.

- [ ] **Step 6: Full core test suite, typecheck, and build**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test && corepack pnpm --filter @jotaese68/core build`
Expected: no errors; every test passes. Confirm `reorganization.ts`/`reorganization.test.ts` no longer exist and `applyReorganizationMove` no longer appears anywhere in `packages/core/src`.

- [ ] **Step 7: Manual verification**

Build the CLI (`corepack pnpm --filter @jotaese68/ycf build`), start a real Cockpit server against a disposable fixture with a real `.ycf/reorganization-plan.json`, and exercise `/apply/move` then `/undo/move` for real via `fetch`/`curl` — confirm the file genuinely moves and genuinely reverts. Record the real output in the task report.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/cockpit.ts packages/core/src/cockpit.test.ts packages/core/src/index.ts
git rm packages/core/src/reorganization.ts packages/core/src/reorganization.test.ts
git commit -m "feat(cockpit): route Reorganize apply/undo through the shared executeRefactorPlan engine and persistent rollback"
```

---

### Task 8: Final verification — one write path, no old regex, everything green

**Files:** none (verification only, unless something is found broken, per the established pattern from P0a/P1's own final tasks).

- [ ] **Step 1: Root typecheck**

Run: `corepack pnpm typecheck`
Expected: no errors.

- [ ] **Step 2: Full workspace test suite**

Run: `corepack pnpm -r test`
Expected: every package's test suite passes.

- [ ] **Step 3: `ycf release` self-check**

Run: `node packages/cli/dist/index.js release . --dependencies`
Expected: `YCF — READY` (this repo's own established CI gate).

- [ ] **Step 4: Confirm the old regexes and old functions are genuinely gone**

Run each of these and confirm zero matches:

```bash
grep -rn "importSpecifierPattern" packages/core/src packages/cli/src
grep -rn "rewriteImportsForMove\|relativeImport" packages/cli/src
grep -rn "applyReorganizationMove" packages/core/src packages/cli/src
```

- [ ] **Step 5: Confirm no parallel write path remains**

Confirm `packages/core/src/reorganization.ts` does not exist. Confirm `packages/cli/src/index.ts`'s `move` command and `packages/core/src/cockpit.ts`'s `/apply/move` handler both call `executeRefactorPlan` and neither calls `atomicWrite`/`writeFileSync`/`renameSync` directly for the moved file or its referencing files (a `grep` for those three identifiers in both files, checked by eye against the surrounding code, is sufficient — this is a structural confirmation, not a new automated test).

- [ ] **Step 6: Manual end-to-end confirmation**

Re-confirm, in the same session, both manual runs already performed in Task 3 (Step 3) and Task 7 (Step 7) are recorded with real output in their respective task reports — this task's report should reference them rather than re-running both from scratch, unless either was left incomplete.

- [ ] **Step 7: Document any real remaining limitation**

If anything genuinely could not be fully closed within this phase's scope (there is no known such gap as this plan is written — this step exists for the executor to be honest if one surfaces during implementation, not to invent one), record it plainly in the task report rather than silently shipping a partial state.

- [ ] **Step 8: Commit (only if Steps 1-3 required a fix)**

If everything was already green, there is nothing to commit for this task. If a fix was needed, commit it with a message describing exactly what broke and why, then re-run Steps 1-3 to confirm green before considering the plan complete.
