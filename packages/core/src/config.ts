import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { AutoIgnoredDirectory, YcfConfig } from './types.js';

export const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'vendor', '.ycf']);

export const defaultConfig: YcfConfig = {
  version: 1, mode: 'balanced', language: 'en', audience: 'guided',
  refactor: { maxFileLines: 700, maxFunctionLines: 80, maxComplexity: 15 },
  security: { dependencyFailOn: 'high' },
  ignore: [...ignoredDirectories], include: []
};

function normalizeConfigKey(value: string): string { return value.trim().replace(/^['"]|['"]$/g, ''); }

/** Read the small, dependency-free subset of YAML used by ycf.config.yml. */
export function loadConfig(target: string): YcfConfig {
  const configPath = join(resolve(target), 'ycf.config.yml');
  if (!existsSync(configPath)) return { ...defaultConfig, refactor: { ...defaultConfig.refactor }, security: { ...defaultConfig.security }, ignore: [...defaultConfig.ignore], include: [] };
  const config = { ...defaultConfig, refactor: { ...defaultConfig.refactor }, security: { ...defaultConfig.security }, ignore: [] as string[], include: [] as string[] };
  let section = '';
  for (const rawLine of readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const sectionMatch = line.match(/^(\w+):\s*$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (section === 'ignore' && listMatch) { config.ignore.push(normalizeConfigKey(listMatch[1])); continue; }
    if (section === 'include' && listMatch) { config.include.push(normalizeConfigKey(listMatch[1])); continue; }
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
    if (section === 'security' && key === 'dependency_fail_on' && /^(low|moderate|high|critical|none)$/.test(value.trim())) config.security.dependencyFailOn = value.trim() as YcfConfig['security']['dependencyFailOn'];
  }
  return config;
}

const vendoredLicensePattern = /^(?:license|licence|copying)(?:\.(?:md|txt))?$/i;
const vendoredReadmePattern = /^(?:readme|changelog)(?:\.(?:md|txt))?$/i;

function countFiles(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    total += statSync(path).isDirectory() ? countFiles(path) : 1;
  }
  return total;
}

/**
 * A folder carrying its own LICENSE and its own README/CHANGELOG, directly inside
 * itself, is the same signal a human reviewer uses to spot a bundled third-party SDK
 * (see skills/ycf-quality-gate/references/reviewing-external-code.md) — a project's own
 * source folders don't normally ship a license file per-folder. `include` overrides a
 * false positive without disabling the heuristic project-wide.
 */
export function detectVendoredSdkDirs(target: string, config: YcfConfig = loadConfig(target)): AutoIgnoredDirectory[] {
  const resolvedTarget = resolve(target);
  const skipped = new Set([...ignoredDirectories, ...config.ignore]);
  const included = new Set(config.include);
  const detected: AutoIgnoredDirectory[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (skipped.has(entry)) continue;
      const path = join(directory, entry);
      if (!statSync(path).isDirectory()) continue;
      if (!included.has(entry)) {
        const siblings = readdirSync(path);
        if (siblings.some((name) => vendoredLicensePattern.test(name)) && siblings.some((name) => vendoredReadmePattern.test(name))) {
          detected.push({ path: relative(resolvedTarget, path) || entry, reason: 'vendored-sdk', files: countFiles(path) });
          continue;
        }
      }
      visit(path);
    }
  };
  visit(resolvedTarget);
  return detected;
}

export function effectiveIgnoredDirectories(target: string, config: YcfConfig, autoIgnored: AutoIgnoredDirectory[] = detectVendoredSdkDirs(target, config)): Set<string> {
  return new Set([...ignoredDirectories, ...config.ignore, ...autoIgnored.map((directory) => directory.path.split(/[\\/]/).pop() ?? directory.path)]);
}
