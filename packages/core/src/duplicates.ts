import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
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
  return [...exact, ...similar];
}

export function duplicateFindings(target: string, files: string[]): Finding[] {
  return duplicateGroups(target, files).map((group) => {
    const [, ...copies] = group.occurrences;
    return {
      id: group.id,
      ruleId: group.kind === 'exact' ? 'duplicate-code' : 'similar-duplicate-code',
      severity: 'medium',
      risk: 'report-only',
      file: copies[0].file,
      lines: [copies[0].startLine, copies[0].endLine],
      evidence: group.kind === 'exact'
        ? `Confirmed: an exact normalized ${group.lines}-line block appears in ${group.occurrences.length} locations (${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}). Review behavior and consumers before consolidation.`
        : `Likely duplicate: structurally similar ${group.lines}-line blocks have ${Math.round(group.similarity * 100)}% lexical overlap in ${group.occurrences.length} locations (${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}). Names or values differ, so compare behavior, errors, and consumers before consolidation.`,
      scoreImpact: Math.min(8, 2 + copies.length * 2)
    };
  });
}
