import { build } from 'esbuild';
import { chmodSync } from 'node:fs';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['commander', 'typescript'],
  sourcemap: true,
  logLevel: 'info'
});

chmodSync('dist/index.js', 0o755);
