export function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

export function lineNumbers(content: string, expression: RegExp): number[] {
  return content.split(/\r?\n/).flatMap((line, index) => (expression.test(line) ? [index + 1] : []));
}
