import { readFileSync, writeFileSync } from 'node:fs';
const path = 'scripts/implement-p0b.mjs';
let text = readFileSync(path, 'utf8');
text = text.split('\\\\`').join('\\`');
text = text.split('\\\\${').join('\\${');
writeFileSync(path, text, 'utf8');
console.log('Normalized implement-p0b template escapes.');
