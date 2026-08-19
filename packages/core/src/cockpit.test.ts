import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startCockpitServer } from './cockpit.js';

let server: ReturnType<typeof startCockpitServer> | undefined;
afterEach(() => { server?.close(); server = undefined; });

function writeReorgPlan(target: string) {
  mkdirSync(join(target, '.ycf'), { recursive: true });
  mkdirSync(join(target, 'legacy'), { recursive: true });
  writeFileSync(join(target, 'legacy/greeting.ts'), 'export const greet = () => "hi";\n');
  writeFileSync(join(target, '.ycf/reorganization-plan.json'), JSON.stringify({
    version: 2, target, generatedAt: new Date().toISOString(),
    summary: { auto: 0, safeRefactor: 0, supervised: 1, architectural: 0, blocked: 0 }, sourceFindings: [],
    blocks: [{
      id: 'RF-MOVE-001', type: 'MOVE', goal: 'reorganize', reason: 'features/ already exists', risk: 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
      files: ['legacy/greeting.ts'], dependencies: [], affectedModules: [], preconditions: [],
      operations: [{ id: 'op-1', kind: 'MOVE', description: 'move', source: 'legacy/greeting.ts', destination: 'features/greeting.ts', updateImports: true }],
      validation: [], rollback: [], status: 'PLANNED'
    }]
  }));
}

describe('Cockpit reorganization endpoints', () => {
  it('serves the reorganization plan and applies a move', async () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-cockpit-'));
    writeReorgPlan(target);
    server = startCockpitServer(target, 4391);
    const headers = { 'x-ycf-token': server.token };
    const planResponse = await fetch(`${server.url}/plan/reorganization`, { headers });
    expect(planResponse.status).toBe(200);
    const planBody = await planResponse.json() as { plan: { blocks: Array<{ id: string }> } };
    expect(planBody.plan.blocks[0].id).toBe('RF-MOVE-001');
    const applyResponse = await fetch(`${server.url}/apply/move`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    expect(applyResponse.status).toBe(200);
    const applyBody = await applyResponse.json() as { status: string };
    expect(applyBody.status).toBe('applied');
  });

  it('returns 404 when no reorganization plan exists yet', async () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-cockpit-'));
    server = startCockpitServer(target, 4392);
    const response = await fetch(`${server.url}/plan/reorganization`, { headers: { 'x-ycf-token': server.token } });
    expect(response.status).toBe(404);
  });

  it('rejects apply/move without a valid token', async () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-cockpit-'));
    writeReorgPlan(target);
    server = startCockpitServer(target, 4393);
    const response = await fetch(`${server.url}/apply/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    expect(response.status).toBe(403);
  });

  it('returns 400 on malformed JSON body instead of crashing the server', async () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-cockpit-'));
    writeReorgPlan(target);
    server = startCockpitServer(target, 4394);
    const headers = { 'x-ycf-token': server.token, 'Content-Type': 'application/json' };
    const malformedResponse = await fetch(`${server.url}/apply/move`, { method: 'POST', headers, body: 'not valid json{' });
    expect(malformedResponse.status).toBe(400);
    const malformedBody = await malformedResponse.json() as { error: string };
    expect(malformedBody.error).toBeTruthy();
    // The process (and this server) must have survived the malformed request -- a
    // subsequent, valid request on the same server should still succeed.
    const followUpResponse = await fetch(`${server.url}/apply/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    expect(followUpResponse.status).toBe(200);
    const followUpBody = await followUpResponse.json() as { status: string };
    expect(followUpBody.status).toBe('applied');
  });

  it('undo reverses an applied move back to pending', async () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-cockpit-'));
    writeReorgPlan(target);
    server = startCockpitServer(target, 4396);
    const headers = { 'x-ycf-token': server.token, 'Content-Type': 'application/json' };
    await fetch(`${server.url}/apply/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    const undoResponse = await fetch(`${server.url}/undo/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    expect(undoResponse.status).toBe(200);
    expect(existsSync(join(target, 'legacy/greeting.ts'))).toBe(true);
    expect(existsSync(join(target, 'features/greeting.ts'))).toBe(false);
  });

  it('keep drops the undo option without touching the file system', async () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-cockpit-'));
    writeReorgPlan(target);
    server = startCockpitServer(target, 4397);
    const headers = { 'x-ycf-token': server.token, 'Content-Type': 'application/json' };
    await fetch(`${server.url}/apply/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    const keepResponse = await fetch(`${server.url}/keep/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    expect(keepResponse.status).toBe(200);
    const undoResponse = await fetch(`${server.url}/undo/move`, { method: 'POST', headers, body: JSON.stringify({ blockId: 'RF-MOVE-001' }) });
    expect(undoResponse.status).toBe(404);
    expect(existsSync(join(target, 'features/greeting.ts'))).toBe(true);
  });
});
