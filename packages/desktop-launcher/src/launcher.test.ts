import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { launchCockpitFor } from './launcher.js';

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('launchCockpitFor', () => {
  it('starts a token-gated server that serves a chooser menu, then runs the requested read-only action live', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-launcher-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'index.js'), 'export const value = 1;');
    const { url, menuUrl, close } = launchCockpitFor(directory);
    try {
      expect(menuUrl.startsWith(`${url}/menu?token=`)).toBe(true);
      const token = new URL(menuUrl).searchParams.get('token');

      const menuResponse = await fetch(menuUrl);
      expect(menuResponse.status).toBe(200);
      expect(await menuResponse.text()).toContain('Analyze my project');

      const auditResponse = await fetch(`${url}/run/audit?token=${token}`);
      expect(auditResponse.status).toBe(200);
      expect(await auditResponse.text()).toContain('YCF — cockpit');

      const releaseResponse = await fetch(`${url}/run/release?token=${token}`);
      expect(releaseResponse.status).toBe(200);
      expect(await releaseResponse.text()).toMatch(/READY|REVIEW REQUIRED/);

      const badTokenResponse = await fetch(`${url}/run/audit?token=wrong`);
      expect(badTokenResponse.status).toBe(403);
    } finally {
      close();
    }
  });
});
