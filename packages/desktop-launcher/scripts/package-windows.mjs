import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'; // confirmed against https://nodejs.org/api/single-executable-applications.html for Node v24

mkdirSync('release', { recursive: true });
execFileSync('node', ['--experimental-sea-config', 'sea-config.json'], { stdio: 'inherit' });
copyFileSync(process.execPath, 'release/YCF-Launcher-Windows.exe');
execFileSync('npx', ['postject', 'release/YCF-Launcher-Windows.exe', 'NODE_SEA_BLOB', 'dist/main.blob', '--sentinel-fuse', SENTINEL_FUSE], { stdio: 'inherit', shell: true });
console.log('Built release/YCF-Launcher-Windows.exe');
