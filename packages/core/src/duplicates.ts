import { readFileSync } from 'node:fs';
import { extname, relative } from 'node:path';
import ts from 'typescript';
import type { DuplicateGroup, Finding } from './types.js';

type DuplicateOccurrence = DuplicateGroup['occurrences'][number];

function normalizedDuplicateLine(line: string): string {
  return line.replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim();
}

function structuralDuplicateLine(line: string): string {
  return line
    .replace(/(['"]).*?\1/g, 'value')
    .replace(/\b\d+(?:\.\d+)?\b/g, 'number')
    .replace(/\b[A-Za-z_$][\w$]*\b/g, (word) => /^(if|else|return|throw|new|const|let|var|function|export|class|for|while|true|false|null|undefined)$/.test(word) ? word : 'name');
}

function lexicalSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.match(/[A-Za-z_$][\w$]*|\d+|[^\s]/g) ?? []);
  const rightTokens = new Set(right.match(/[A-Za-z_$][\w$]*|\d+|[^\s]/g) ?? []);
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / new Set([...leftTokens, ...rightTokens]).size;
}

const astExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
function scriptKindFor(file: string): ts.ScriptKind { if (file.endsWith('.tsx')) return ts.ScriptKind.TSX; if (file.endsWith('.jsx')) return ts.ScriptKind.JSX; if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS; return ts.ScriptKind.TS; }
// Collapses a function/class body to its structural shape only: identifiers and literal
// values are erased, so two declarations that differ only by renaming or reformatting
// still compare equal. This is not semantic equivalence — reordered or differently
// expressed logic is not detected — see YCF-Pendientes-y-Bloqueos.md.
function statementShape(node: ts.Node): string {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return 'ID';
  if (ts.isStringLiteralLike(node)) return 'STR';
  if (ts.isNumericLiteral(node)) return 'NUM';
  const children: string[] = [];
  node.forEachChild((child) => { children.push(statementShape(child)); });
  return `${node.kind}(${children.join(',')})`;
}
interface SemanticCandidate { file: string; startLine: number; endLine: number; shape: string; size: number; }
function semanticCandidates(target: string, file: string): SemanticCandidate[] {
  if (!astExtensions.has(extname(file))) return [];
  let text: string; try { text = readFileSync(file, 'utf8'); } catch { return []; }
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const displayPath = relative(target, file); const out: SemanticCandidate[] = [];
  const record = (node: ts.Node, body: ts.Node): void => {
    const shape = statementShape(body);
    if (shape.length < 60) return;
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
    out.push({ file: displayPath, startLine, endLine, shape, size: endLine - startLine + 1 });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.body) record(node, node.body);
    else if (ts.isMethodDeclaration(node) && node.body) record(node, node.body);
    else if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) && node.initializer.body) record(node.initializer, node.initializer.body);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}
function semanticDuplicateGroups(target: string, files: string[]): DuplicateGroup[] {
  const grouped = new Map<string, SemanticCandidate[]>();
  for (const candidate of files.flatMap((file) => semanticCandidates(target, file))) { const list = grouped.get(candidate.shape) ?? []; list.push(candidate); grouped.set(candidate.shape, list); }
  return [...grouped.values()].filter((group) => group.length > 1 && new Set(group.map((item) => item.file)).size > 1).map((group) => ({
    id: `possible-semantic-duplicate:${group.map((item) => `${item.file}:${item.startLine}`).join(':')}`,
    kind: 'semantic' as const, certainty: 'possible' as const, similarity: 1, lines: group[0].size,
    occurrences: group.map((item) => ({ file: item.file, startLine: item.startLine, endLine: item.endLine }))
  }));
}

export function duplicateGroups(target: string, files: string[]): DuplicateGroup[] {
  const blocks = new Map<string, DuplicateOccurrence[]>();
  const candidates: Array<{ key: string; structuralKey: string; source: string; occurrence: DuplicateOccurrence }> = [];
  for (const file of files) {
    const displayPath = relative(target, file);
    const normalized = readFileSync(file, 'utf8').split(/\r?\n/).map(normalizedDuplicateLine);
    for (let index = 0; index <= normalized.length - 6; index += 1) {
      const block = normalized.slice(index, index + 6);
      if (block.some((line) => !line) || block.join('').length < 80) continue;
      const key = block.join('\n');
      const occurrences = blocks.get(key) ?? [];
      const occurrence = { file: displayPath, startLine: index + 1, endLine: index + 6 };
      occurrences.push(occurrence);
      blocks.set(key, occurrences);
      candidates.push({ key, structuralKey: block.map(structuralDuplicateLine).join('\n'), source: key, occurrence });
    }
  }
  const exact = [...blocks.values()]
    .filter((occurrences) => occurrences.length > 1)
    .map((occurrences) => ({ id: `duplicate-code:${occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(':')}`, kind: 'exact' as const, certainty: 'confirmed' as const, similarity: 1, lines: 6, occurrences }));
  const repeatedExactKeys = new Set([...blocks].filter(([, occurrences]) => occurrences.length > 1).map(([key]) => key));
  const structural = new Map<string, typeof candidates>();
  for (const candidate of candidates.filter((candidate) => !repeatedExactKeys.has(candidate.key))) structural.set(candidate.structuralKey, [...(structural.get(candidate.structuralKey) ?? []), candidate]);
  const similar = [...structural.values()].flatMap((group) => {
    const distinctFiles = new Set(group.map((candidate) => candidate.occurrence.file));
    if (group.length < 2 || distinctFiles.size < 2) return [];
    const similarity = Math.min(...group.slice(1).map((candidate) => lexicalSimilarity(group[0].source, candidate.source)));
    if (similarity < 0.45) return [];
    const occurrences = group.map((candidate) => candidate.occurrence);
    return [{ id: `similar-duplicate-code:${occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(':')}`, kind: 'similar' as const, certainty: 'likely' as const, similarity: Number(similarity.toFixed(2)), lines: 6, occurrences }];
  });
  return [...exact, ...similar, ...semanticDuplicateGroups(target, files)];
}

export function duplicateFindings(target: string, files: string[]): Finding[] {
  return duplicateGroups(target, files).map((group) => {
    const [, ...copies] = group.occurrences;
    return {
      id: group.id,
      ruleId: group.kind === 'exact' ? 'duplicate-code' : group.kind === 'similar' ? 'similar-duplicate-code' : 'possible-semantic-duplicate',
      severity: 'medium',
      risk: 'report-only',
      file: copies[0].file,
      lines: [copies[0].startLine, copies[0].endLine],
      evidence: group.kind === 'exact'
        ? `Confirmed: an exact normalized ${group.lines}-line block appears in ${group.occurrences.length} locations (${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}). Review behavior and consumers before consolidation.`
        : group.kind === 'similar'
        ? `Likely duplicate: structurally similar ${group.lines}-line blocks have ${Math.round(group.similarity * 100)}% lexical overlap in ${group.occurrences.length} locations (${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}). Names or values differ, so compare behavior, errors, and consumers before consolidation.`
        : `Possible semantic duplicate: these functions share the exact same statement shape despite different names, in ${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}. This is a shape match, not a proven behavior match — read both before treating them as the same thing.`,
      scoreImpact: Math.min(8, 2 + copies.length * 2)
    };
  });
}
