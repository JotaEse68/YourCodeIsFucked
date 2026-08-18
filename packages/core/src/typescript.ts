import { extname } from 'node:path';
import ts from 'typescript';
import type { Finding } from './types.js';
import { lineAt } from './text-utils.js';

function suppressionLines(file: string, content: string): number[] {
  return ['.ts', '.tsx'].includes(extname(file))
    ? content.split(/\r?\n/).flatMap((line, index) => /^\s*\/\/\s*@ts-(?:ignore|nocheck)\b/.test(line) ? [index + 1] : [])
    : [];
}

function publicAnyLines(file: string, content: string): number[] {
  if (!['.ts', '.tsx'].includes(extname(file))) return [];
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = new Set<number>();
  const exported = (node: ts.Node): boolean => ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  const isAny = (node: ts.TypeNode | undefined): boolean => node?.kind === ts.SyntaxKind.AnyKeyword;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && exported(node) && (node.parameters.some((parameter) => isAny(parameter.type)) || isAny(node.type))) lines.add(lineAt(content, node.getStart(sourceFile)));
    if (ts.isInterfaceDeclaration(node) && exported(node)) for (const member of node.members) if (ts.isPropertySignature(member) && isAny(member.type)) lines.add(lineAt(content, member.getStart(sourceFile)));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...lines].sort((left, right) => left - right);
}

/** Reports only: TypeScript suppressions and public `any` are never changed automatically. */
export function typescriptFindings(file: string, content: string, displayPath: string): Finding[] {
  const suppressed = suppressionLines(file, content);
  const publicAny = publicAnyLines(file, content);
  return [
    ...(suppressed.length ? [{ id: `typescript-error-suppression:${displayPath}`, ruleId: 'typescript-error-suppression' as const, severity: 'medium' as const, risk: 'report-only' as const, file: displayPath, lines: suppressed, evidence: `${suppressed.length} TypeScript error suppression comment(s) hide compiler feedback. Read the original error and replace the suppression only after confirming the runtime behavior.`, scoreImpact: Math.min(suppressed.length * 3, 8) }] : []),
    ...(publicAny.length ? [{ id: `typescript-public-any:${displayPath}`, ruleId: 'typescript-public-any' as const, severity: 'low' as const, risk: 'report-only' as const, file: displayPath, lines: publicAny, evidence: `${publicAny.length} exported TypeScript API declaration(s) use explicit any. Consumers lose useful checks; define the narrowest safe input or output type before changing callers.`, scoreImpact: Math.min(publicAny.length * 2, 8) }] : [])
  ];
}
