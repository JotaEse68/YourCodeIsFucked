import { extname } from 'node:path';
import ts from 'typescript';

export interface SpecifierMatch {
  start: number;
  end: number;
  specifier: string;
}

export interface ReferenceRewriter {
  canHandle(file: string): boolean;
  findReferences(sourceFile: string, content: string): SpecifierMatch[];
  rewrite(content: string, matches: SpecifierMatch[], newSpecifierFor: (match: SpecifierMatch) => string | undefined): string;
}

const handledExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

function scriptKind(file: string): ts.ScriptKind {
  switch (extname(file).toLowerCase()) {
    case '.tsx': return ts.ScriptKind.TSX;
    case '.jsx': return ts.ScriptKind.JSX;
    case '.ts': return ts.ScriptKind.TS;
    default: return ts.ScriptKind.JS;
  }
}

function literalMatch(node: ts.StringLiteralLike, source: ts.SourceFile): SpecifierMatch {
  return {
    start: node.getStart(source) + 1,
    end: node.end - 1,
    specifier: node.text,
  };
}

export const jsTsReferenceRewriter: ReferenceRewriter = {
  canHandle(file) {
    return handledExtensions.has(extname(file).toLowerCase());
  },

  findReferences(sourceFile, content) {
    if (!this.canHandle(sourceFile)) return [];
    const source = ts.createSourceFile(sourceFile, content, ts.ScriptTarget.Latest, true, scriptKind(sourceFile));
    const matches: SpecifierMatch[] = [];

    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        matches.push(literalMatch(node.moduleSpecifier, source));
      } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        if (isRequire || isDynamicImport) matches.push(literalMatch(node.arguments[0], source));
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
    return matches.sort((a, b) => a.start - b.start);
  },

  rewrite(content, matches, newSpecifierFor) {
    let output = content;
    for (const match of [...matches].sort((a, b) => b.start - a.start)) {
      const replacement = newSpecifierFor(match);
      if (replacement === undefined || replacement === match.specifier) continue;
      output = output.slice(0, match.start) + replacement + output.slice(match.end);
    }
    return output;
  },
};
