#!/usr/bin/env node
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import { audit } from '@ycf/core';

const defaultConfig = `version: 1\n\nmode: balanced\n\nsafety:\n  require_git: true\n  checkpoints: true\n  protect_public_api: true\n  protect_database_schema: true\n\nignore:\n  - node_modules\n  - vendor\n  - dist\n  - build\n  - .git\n`;

const program = new Command()
  .name('ycf')
  .description('YCF — YourCodeIsFucked. Deterministic codebase quality tooling.')
  .version('0.1.0-dev');

program.command('init [target]').description('Create YCF configuration without overwriting existing files.').action((target = '.') => {
  const directory = resolve(target);
  const configPath = join(directory, 'ycf.config.yml');
  mkdirSync(join(directory, '.ycf'), { recursive: true });
  if (existsSync(configPath)) {
    console.log(`YCF is already initialized: ${configPath}`);
    return;
  }
  writeFileSync(configPath, defaultConfig, 'utf8');
  console.log(`Initialized YCF: ${configPath}`);
});

program.command('audit [target]').description('Audit a repository without modifying it.').option('--json', 'Emit the complete JSON report.').action((target = '.', options) => {
  const report = audit(target);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('YCF — YourCodeIsFucked');
  console.log(`Target: ${report.target}`);
  console.log(`Stacks: ${report.stacks.join(', ') || 'unknown'}`);
  console.log(`Source files: ${report.sourceFiles}`);
  console.log(`Git: ${report.git.detected ? 'detected' : 'not detected'}`);
  console.log(`Findings: ${report.findings.length}`);
  for (const finding of report.findings) console.log(`[${finding.severity}] ${finding.file}:${finding.lines.join(', ')} — ${finding.evidence}`);
  console.log(`FUCKED SCORE: ${report.score.fucked}%`);
  console.log(`HEALTH SCORE: ${report.score.health}/100`);
  console.log('Audit mode is read-only.');
});

program.parse();
