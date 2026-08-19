import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { RefactorOperation } from './refactor-types.js';
import { assessRefactorSafety } from './refactor-safety.js';
import { atomicWrite } from './fs-atomic.js';

const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.php']; const ignored = new Set(['node_modules', 'vendor', 'dist', 'build', '.git', '.ycf']);
function walk(directory: string): string[] { const out: string[] = []; for (const entry of readdirSync(directory)) { if (ignored.has(entry)) continue; const file = resolve(directory, entry); const info = statSync(file); if (info.isDirectory()) out.push(...walk(file)); else if (extensions.includes(extname(file))) out.push(file); } return out; }
function stripExt(file: string): string { return file.replace(/\.(?:[cm]?js|jsx|tsx?|php)$/i, ''); }
function sameModule(a: string, b: string): boolean { return stripExt(resolve(a)).toLowerCase() === stripExt(resolve(b)).toLowerCase(); }
function relativeSpecifier(importer: string, destination: string, original: string): string { const next = relative(dirname(importer), destination).replaceAll('\\', '/'); const value = next.startsWith('.') ? next : `./${next}`; const originalHasExt = /\.(?:[cm]?js|jsx|tsx?|php)$/i.test(original); if (!originalHasExt) return stripExt(value); const originalExt = original.match(/(\.[^.]+)$/)?.[1] ?? ''; return `${stripExt(value)}${originalExt}`; }
// TypeScript specifiers never carry a .ts/.tsx extension (the compiler rejects it under
// classic/bundler resolution); JS-family specifiers need their real extension so the
// import resolves under native Node ESM (`type: module`), where extension-less relative
// imports throw ERR_MODULE_NOT_FOUND. Unlike rewriteReferences, EXTRACT has no pre-existing
// specifier to copy the convention from, so it must decide from the new file's own extension.
function newModuleSpecifier(importer: string, destination: string): string { return /\.tsx?$/i.test(destination) ? relativeSpecifier(importer, destination, './x') : relativeSpecifier(importer, destination, destination); }
function declarationNames(node: ts.Node): string[] {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return node.name ? [node.name.text] : [];
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap((declaration) => declaration.name.getText().match(/^[$A-Z_a-z][$\w]*$/) ? [declaration.name.getText()] : []);
  return [];
}
function isExtractableDeclaration(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isVariableStatement(node);
}
function isExported(node: ts.Node): boolean { return !!(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)); }
function importedBindings(statement: ts.ImportDeclaration): string[] {
  const clause = statement.importClause; if (!clause) return [];
  const names = clause.name ? [clause.name.text] : [];
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.push(clause.namedBindings.name.text);
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) names.push(...clause.namedBindings.elements.flatMap((element) => [element.name.text, element.propertyName?.text ?? '']));
  return names.filter(Boolean);
}
function referencedImportedBindings(node: ts.Node, imports: ts.ImportDeclaration[]): ts.ImportDeclaration[] {
  const used = new Set<string>();
  const visit = (current: ts.Node): void => { if (ts.isIdentifier(current)) {
    const parent = current.parent; const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === current) || (ts.isPropertyDeclaration(parent) && parent.name === current);
    if (!isPropertyName) used.add(current.text);
  } ts.forEachChild(current, visit); };
  visit(node);
  return imports.filter((statement) => importedBindings(statement).some((name) => used.has(name)));
}
function hasThisOrSuper(node: ts.Node): boolean {
  let found = false; const visit = (current: ts.Node): void => { if (current.kind === ts.SyntaxKind.ThisKeyword || current.kind === ts.SyntaxKind.SuperKeyword) found = true; ts.forEachChild(current, visit); }; visit(node); return found;
}
function extractDeclaration(sourceText: string, sourceFile: ts.SourceFile, startLine: number, endLine: number, exportedNames: string[]): { node: ts.Node; start: number; end: number; imports: string } {
  const selected = sourceFile.statements.find((statement) => {
    const start = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
    const end = sourceFile.getLineAndCharacterOfPosition(statement.end).line + 1;
    return isExtractableDeclaration(statement) && start === startLine && end === endLine;
  });
  if (!selected) throw new Error('BLOCK: extraction must select one complete top-level declaration with exact AST boundaries.');
  if (!isExported(selected)) throw new Error('BLOCK: extraction requires an explicitly exported declaration.');
  const names = declarationNames(selected);
  if (names.length !== exportedNames.length || names.some((name) => !exportedNames.includes(name))) throw new Error('BLOCK: exportedNames do not match the selected AST declaration.');
  const otherDeclarations = sourceFile.statements.filter((statement) => isExtractableDeclaration(statement) && statement !== selected).flatMap(declarationNames);
  const localReferences = new Set<string>();
  const visit = (current: ts.Node): void => { if (ts.isIdentifier(current) && otherDeclarations.includes(current.text)) {
    const parent = current.parent; const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === current) || (ts.isPropertyDeclaration(parent) && parent.name === current);
    if (!isPropertyName) localReferences.add(current.text);
  } ts.forEachChild(current, visit); };
  visit(selected);
  if (localReferences.size) throw new Error(`BLOCK: extraction depends on declarations that would remain in the source: ${[...localReferences].join(', ')}.`);
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const copiedImports = referencedImportedBindings(selected, imports).map((statement) => statement.getText(sourceFile)).join('\n');
  return { node: selected, start: selected.getFullStart(), end: selected.end, imports: copiedImports };
}
interface Alias { pattern: string; targets: string[]; baseUrl: string; }
const importSpecifierPattern = /\b(?:from\s*|export\s+(?:type\s+)?[^;]*?\sfrom\s*|import\s*\(\s*|require\s*\(\s*)(["'])([^"']+)\1/g;
function aliases(root: string): Alias[] { for (const name of ['tsconfig.json', 'jsconfig.json']) { const file = resolve(root, name); if (!existsSync(file)) continue; try { const json = JSON.parse(readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }; const baseUrl = resolve(root, json.compilerOptions?.baseUrl ?? '.'); return Object.entries(json.compilerOptions?.paths ?? {}).map(([pattern, targets]) => ({ pattern, targets, baseUrl })); } catch { return []; } } return []; }
function resolveImport(importer: string, specifier: string, root: string, configured: Alias[]): string | undefined { const candidates: string[] = []; if (specifier.startsWith('.') || specifier.startsWith('/')) { const base = resolve(dirname(importer), specifier); candidates.push(base); if (/\.(?:js|jsx|mjs|cjs)$/i.test(specifier)) candidates.push(stripExt(base)); } for (const alias of configured) { const escaped = alias.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '(.*)'); const match = specifier.match(new RegExp(`^${escaped}$`)); if (match) for (const target of alias.targets) candidates.push(resolve(alias.baseUrl, target.replace('*', match[1] ?? ''))); } for (const base of candidates) for (const file of [base, ...extensions.map((extension) => `${base}${extension}`), ...extensions.map((extension) => resolve(base, `index${extension}`))]) if (existsSync(file)) return file; return undefined; }
function rewriteReferences(root: string, source: string, destination: string): { changed: string[]; before: Map<string, string> } { const sourceAbs = resolve(root, source); const destinationAbs = resolve(root, destination); const configured = aliases(root); const before = new Map<string, string>(); const changed: string[] = []; for (const file of walk(root)) { const original = readFileSync(file, 'utf8'); const updated = original.replace(importSpecifierPattern, (whole, _quote: string, specifier: string) => { const resolved = resolveImport(file, specifier, root, configured); return resolved && sameModule(resolved, sourceAbs) ? whole.replace(specifier, relativeSpecifier(file, destinationAbs, specifier)) : whole; }); if (updated !== original) { before.set(file, original); atomicWrite(file, updated); changed.push(relative(root, file)); } } const moved = readFileSync(sourceAbs, 'utf8'); const internal = moved.replace(importSpecifierPattern, (whole, _quote: string, specifier: string) => { const resolved = resolveImport(sourceAbs, specifier, root, configured); if (!resolved) { if (specifier.startsWith('.')) throw new Error(`BLOCK: cannot resolve internal import ${specifier} in ${source}`); return whole; } return whole.replace(specifier, relativeSpecifier(destinationAbs, resolved, specifier)); }); if (internal !== moved) { before.set(sourceAbs, moved); atomicWrite(sourceAbs, internal); } return { changed, before }; }

function packageJsonFiles(root: string): string[] { const out: string[] = []; const visit = (directory: string): void => { for (const entry of readdirSync(directory)) { if (ignored.has(entry)) continue; const file = resolve(directory, entry); if (statSync(file).isDirectory()) visit(file); else if (entry === 'package.json') out.push(file); } }; visit(root); return out; }
function collectExportPaths(value: unknown, out: string[]): void { if (typeof value === 'string') { out.push(value); return; } if (value && typeof value === 'object') for (const nested of Object.values(value as Record<string, unknown>)) collectExportPaths(nested, out); }
function publicEntryPoints(root: string): Set<string> {
  const entries = new Set<string>();
  for (const file of packageJsonFiles(root)) {
    try {
      const json = JSON.parse(readFileSync(file, 'utf8')) as { main?: string; module?: string; types?: string; typings?: string; bin?: string | Record<string, string>; exports?: unknown };
      const raw: string[] = [];
      if (json.main) raw.push(json.main); if (json.module) raw.push(json.module); if (json.types) raw.push(json.types); if (json.typings) raw.push(json.typings);
      if (typeof json.bin === 'string') raw.push(json.bin); else if (json.bin) raw.push(...Object.values(json.bin));
      if (json.exports) collectExportPaths(json.exports, raw);
      for (const value of raw) if (value.startsWith('.')) entries.add(resolve(dirname(file), value));
    } catch { /* an unparsable package.json cannot name an entry point */ }
  }
  return entries;
}
const reexportPattern = /\bexport\s*(?:\*|\{[^}]*\})\s*from\s*(["'])([^"']+)\1/g;
function isReExported(root: string, duplicateFile: string): boolean {
  const duplicateAbs = resolve(root, duplicateFile); const configured = aliases(root);
  for (const file of walk(root)) {
    if (resolve(file) === duplicateAbs) continue;
    const text = readFileSync(file, 'utf8'); let match: RegExpExecArray | null;
    while ((match = reexportPattern.exec(text))) { const resolved = resolveImport(file, match[2], root, configured); if (resolved && sameModule(resolved, duplicateAbs)) return true; }
  }
  return false;
}

export interface AppliedOperation { operationId: string; changedFiles: string[]; description: string; relatedTestFiles: string[]; undo: () => void; }
function relatedTestFiles(root: string, exportedNames: string[]): string[] {
  const testFilePattern = /\.(test|spec)\.[cm]?[jt]sx?$/i;
  const nameBoundary = exportedNames.map((name) => `\\b${name}\\b`).join('|');
  if (!nameBoundary) return [];
  const pattern = new RegExp(nameBoundary);
  return walk(root).filter((file) => testFilePattern.test(file) && pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file).replaceAll('\\', '/')).sort();
}
export function applyRefactorOperation(target: string, operation: RefactorOperation): AppliedOperation { const root = resolve(target); const id = operation.id;
  if (operation.kind === 'MOVE' || operation.kind === 'RENAME') { const source = resolve(root, operation.source); const destination = resolve(root, operation.destination); if (!existsSync(source)) throw new Error(`Source does not exist: ${operation.source}`); if (existsSync(destination)) throw new Error(`Destination already exists: ${operation.destination}`); const contents = new Map(walk(root).map((file) => [file, readFileSync(file, 'utf8')])); const safety = assessRefactorSafety([source], contents); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (publicEntryPoints(root).has(source)) throw new Error('BLOCKED: this file is a public package entry point (main/module/exports/bin/types); moving it would change a public contract.'); if (isReExported(root, operation.source)) throw new Error('BLOCKED: this file is re-exported (export * / export { X } from) elsewhere; moving it would change a public contract.'); const ref = operation.updateImports ? rewriteReferences(root, operation.source, operation.destination) : { changed: [], before: new Map<string, string>() }; mkdirSync(dirname(destination), { recursive: true }); renameSync(source, destination); return { operationId: id, changedFiles: [...new Set([...ref.changed, operation.source, operation.destination])], description: operation.description, relatedTestFiles: [], undo: () => { if (existsSync(destination)) renameSync(destination, source); for (const [file, content] of ref.before) atomicWrite(file, content); } }; }
  if (operation.kind === 'CREATE') { const file = resolve(root, operation.file); if (existsSync(file)) throw new Error(`Destination already exists: ${operation.file}`); { const safety = assessRefactorSafety([file], new Map([[file, operation.content]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); } mkdirSync(dirname(file), { recursive: true }); atomicWrite(file, operation.content); return { operationId: id, changedFiles: [operation.file], description: operation.description, relatedTestFiles: [], undo: () => { if (existsSync(file)) unlinkSync(file); } }; }
  if (operation.kind === 'DELETE') { const file = resolve(root, operation.file); const content = readFileSync(file, 'utf8'); { const safety = assessRefactorSafety([file], new Map([[file, content]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); } unlinkSync(file); return { operationId: id, changedFiles: [operation.file], description: operation.description, relatedTestFiles: [], undo: () => { mkdirSync(dirname(file), { recursive: true }); atomicWrite(file, content); } }; }
  if (operation.kind === 'EDIT_IMPORT' || operation.kind === 'EDIT_EXPORT') { const file = resolve(root, operation.file); const before = readFileSync(file, 'utf8'); { const safety = assessRefactorSafety([file], new Map([[file, before]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); } let after = before; for (const replacement of operation.replacements) after = after.split(replacement.from).join(replacement.to); if (after !== before) atomicWrite(file, after); return { operationId: id, changedFiles: after === before ? [] : [operation.file], description: operation.description, relatedTestFiles: [], undo: () => atomicWrite(file, before) }; }
  if (operation.kind === 'EXTRACT') {
    const source = resolve(root, operation.sourceFile); const destination = resolve(root, operation.targetFile);
    if (publicEntryPoints(root).has(source)) throw new Error('BLOCKED: this file is a public package entry point (main/module/exports/bin/types); extracting from it would change a public contract.');
    if (isReExported(root, operation.sourceFile)) throw new Error('BLOCKED: this file is re-exported (export * / export { X } from) elsewhere; extracting from it would change a public contract.');
    if (existsSync(destination)) throw new Error(`Destination already exists: ${operation.targetFile}`);
    const before = readFileSync(source, 'utf8');
    { const safety = assessRefactorSafety([source], new Map([[source, before]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); }
    const scriptKind = /\.tsx?$/i.test(source) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX;
    const sourceFile = ts.createSourceFile(source, before, ts.ScriptTarget.Latest, true, scriptKind);
    const extracted = extractDeclaration(before, sourceFile, operation.range.startLine, operation.range.endLine, operation.exportedNames);
    const extractedText = before.slice(extracted.start, extracted.end).trim();
    if (!extractedText || hasThisOrSuper(extracted.node)) throw new Error('SUPERVISED: extraction has ambiguous outer scope.');
    const path = newModuleSpecifier(source, destination);
    const sourceAfter = `import { ${operation.exportedNames.join(', ')} } from '${path}';\nexport { ${operation.exportedNames.join(', ')} };\n${before.slice(0, extracted.start)}${before.slice(extracted.end)}`;
    const destinationAfter = `${extracted.imports ? `${extracted.imports}\n\n` : ''}${extractedText}\n`;
    mkdirSync(dirname(destination), { recursive: true }); atomicWrite(destination, destinationAfter); atomicWrite(source, sourceAfter);
    return { operationId: id, changedFiles: [operation.sourceFile, operation.targetFile], description: operation.description, relatedTestFiles: relatedTestFiles(root, operation.exportedNames), undo: () => { atomicWrite(source, before); if (existsSync(destination)) unlinkSync(destination); } };
  }
  if (operation.kind === 'CONSOLIDATE') {
    const canonical = resolve(root, operation.canonicalFile); const duplicate = resolve(root, operation.duplicateFile);
    const canonicalText = readFileSync(canonical, 'utf8'); const duplicateText = readFileSync(duplicate, 'utf8');
    const safety = assessRefactorSafety([canonical, duplicate], new Map([[canonical, canonicalText], [duplicate, duplicateText]]));
    if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`);
    if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`);
    const publicEntries = publicEntryPoints(root);
    if (publicEntries.has(canonical) || publicEntries.has(duplicate)) throw new Error('BLOCKED: one of these files is a public package entry point (main/exports/bin/types); consolidating would change a public contract.');
    if (isReExported(root, operation.duplicateFile)) throw new Error('BLOCKED: the duplicate file is re-exported (export * / export { X } from) elsewhere; consolidating would change a public contract.');
    if (canonicalText.replace(/\s/g, '') !== duplicateText.replace(/\s/g, '')) throw new Error('SUPERVISED: files are not exact duplicates.');
    const ref = rewriteReferences(root, operation.duplicateFile, operation.canonicalFile); unlinkSync(duplicate);
    return { operationId: id, changedFiles: [...ref.changed, operation.duplicateFile], description: operation.description, relatedTestFiles: [], undo: () => { atomicWrite(duplicate, duplicateText); for (const [file, content] of ref.before) atomicWrite(file, content); } };
  }
  throw new Error(`Unsupported operation: ${String(operation.kind)}`);
}
