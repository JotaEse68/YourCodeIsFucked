import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { YcfConfig } from './types.js';

export const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'vendor', '.ycf']);

export const defaultConfig: YcfConfig = {
  version: 1, mode: 'balanced', language: 'en', audience: 'guided',
  refactor: { maxFileLines: 700, maxFunctionLines: 80, maxComplexity: 15 }, ignore: [...ignoredDirectories]
};

function normalizeConfigKey(value: string): string { return value.trim().replace(/^['"]|['"]$/g, ''); }

/** Read the small, dependency-free subset of YAML used by ycf.config.yml. */
export function loadConfig(target: string): YcfConfig {
  const configPath = join(resolve(target), 'ycf.config.yml');
  if (!existsSync(configPath)) return { ...defaultConfig, refactor: { ...defaultConfig.refactor }, ignore: [...defaultConfig.ignore] };
  const config = { ...defaultConfig, refactor: { ...defaultConfig.refactor }, ignore: [] as string[] };
  let section = '';
  for (const rawLine of readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const sectionMatch = line.match(/^(\w+):\s*$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (section === 'ignore' && listMatch) { config.ignore.push(normalizeConfigKey(listMatch[1])); continue; }
    const setting = line.match(/^\s*([\w_]+):\s*(.+)$/);
    if (!setting) continue;
    const [, key, value] = setting;
    if (key === 'mode' && /^(conservative|balanced|aggressive)$/.test(value.trim())) config.mode = value.trim() as YcfConfig['mode'];
    if (key === 'language' && /^(en|es|pt|fr|de|it|ar|zh)$/.test(value.trim())) config.language = value.trim() as YcfConfig['language'];
    if (key === 'audience' && /^(guided|technical|professional)$/.test(value.trim())) config.audience = value.trim() as YcfConfig['audience'];
    if (section === 'refactor') {
      const number = Number(value.trim());
      if (Number.isFinite(number) && number > 0) {
        if (key === 'max_file_lines') config.refactor.maxFileLines = number;
        if (key === 'max_function_lines') config.refactor.maxFunctionLines = number;
        if (key === 'max_complexity') config.refactor.maxComplexity = number;
      }
    }
  }
  return config;
}
