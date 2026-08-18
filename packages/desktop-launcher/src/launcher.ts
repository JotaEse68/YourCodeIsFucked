import { readFileSync } from 'node:fs';
import { openBrowser, startCockpitServer } from '@jotaese68/core';
import { pickProjectFolder } from './folder-picker.js';

/** Starts the server and points the browser at the chooser menu -- no scan runs until the person actually picks something. */
export function launchCockpitFor(target: string, onServerError?: (error: Error) => void): { url: string; menuUrl: string; close: () => void } {
  const server = startCockpitServer(target, 4287, onServerError);
  return { url: server.url, menuUrl: `${server.url}/menu?token=${server.token}`, close: server.close };
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
    const { menuUrl, close } = launchCockpitFor(target, (error) => {
      console.log('YCF could not start its local server:');
      console.log(error.message);
      console.log('Close any other YCF window that might already be running, then try again.');
      pauseBeforeExit();
      process.exit(1);
    });
    process.on('SIGINT', () => { close(); process.exit(0); });
    console.log('YCF — local read-only server running (close this window to stop).');
    if (openBrowser(menuUrl)) console.log('YCF is running. Choose what you want in the browser tab. Close this window when you are done.');
    else console.log(`Open this in your browser: ${menuUrl}`);
  } catch (error) {
    console.log('Something went wrong:');
    console.log(error instanceof Error ? error.message : String(error));
    pauseBeforeExit();
  }
}
