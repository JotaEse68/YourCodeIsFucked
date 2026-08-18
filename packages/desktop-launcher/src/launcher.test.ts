import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { launchCockpitFor } from './launcher.js';

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('launchCockpitFor', () => {
  it('writes a self-contained cockpit HTML file and starts a token-protected local server for the chosen folder', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-launcher-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'index.js'), 'export const value = 1;');
    const { cockpitPath, url, close } = launchCockpitFor(directory);
    try {
      expect(cockpitPath.endsWith(join('.ycf', 'cockpit.html'))).toBe(true);
      const response = await fetch(`${url}/plan/audit`, { headers: { 'x-ycf-token': 'wrong-token' } });
      expect(response.status).toBe(403);
    } finally {
      close();
    }
  });
});
