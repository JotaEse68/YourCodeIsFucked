import { renameSync, writeFileSync } from 'node:fs';

export function atomicWrite(file: string, content: string): void {
  const temp = `${file}.ycf-tmp-${process.pid}`;
  writeFileSync(temp, content, 'utf8');
  renameSync(temp, file);
}
