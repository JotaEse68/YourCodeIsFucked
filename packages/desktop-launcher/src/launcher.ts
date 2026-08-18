import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { audit, cockpitActionsHtml, cockpitHtml, openBrowser, startCockpitServer, understand, verificationPlan } from '@jotaese68/core';
import { pickProjectFolder } from './folder-picker.js';

export function launchCockpitFor(target: string, onServerError?: (error: Error) => void): { url: string; cockpitPath: string; close: () => void } {
  const report = understand(target);
  const auditReport = audit(target);
  const server = startCockpitServer(target, 4287, onServerError);
  const bootstrap = `<script>window.__YCF_COCKPIT__=${JSON.stringify({ token: server.token, base: server.url })};</script>`;
  const cockpit = cockpitHtml(report, auditReport, verificationPlan(target)).replace('</body>', `${bootstrap}${cockpitActionsHtml()}</body>`);
  const outputDir = join(target, '.ycf');
  mkdirSync(outputDir, { recursive: true });
  const cockpitPath = join(outputDir, 'cockpit.html');
  writeFileSync(cockpitPath, cockpit, 'utf8');
  return { url: server.url, cockpitPath, close: server.close };
}

function pauseBeforeExit(): void {
  console.log('Press Enter to close this window...');
  try { readFileSync(0, 'utf8'); } catch { /* stdin unavailable (e.g. non-interactive run) -- nothing more to do */ }
}

export function runLauncher(): void {
  try {
    console.log('YCF — choose the project folder you want to open.');
    const target = pickProjectFolder();
    if (!target) {
      console.log('No folder selected. Close this window and double-click YCF again when you are ready.');
      pauseBeforeExit();
      return;
    }
    console.log(`YCF — opening: ${target}`);
    console.log('Analyzing... this can take a few minutes on large folders.');
    const { cockpitPath, url, close } = launchCockpitFor(target, (error) => {
      console.log('YCF could not start its local server:');
      console.log(error.message);
      console.log('Close any other YCF window that might already be running, then try again.');
      pauseBeforeExit();
      process.exit(1);
    });
    process.on('SIGINT', () => { close(); process.exit(0); });
    console.log(`YCF — local read-only server running at ${url} (close this window to stop).`);
    if (openBrowser(cockpitPath)) console.log('YCF is running. Close this window when you are done.');
    else console.log(`Open this file in your browser: ${cockpitPath}`);
  } catch (error) {
    console.log('Something went wrong:');
    console.log(error instanceof Error ? error.message : String(error));
    pauseBeforeExit();
  }
}
