import { relative, resolve } from 'node:path';
import type { ImpactReport, UnderstandReport } from './types.js';

function impactClosure(start: string, adjacency: Map<string, string[]>): string[] {
  const seen = new Set<string>();
  const queue = [...(adjacency.get(start) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === start || seen.has(current)) continue;
    seen.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return [...seen].sort();
}

export function impactAnalysis(target: string, module: string, understand: (target: string) => UnderstandReport): ImpactReport {
  const understanding = understand(target);
  const requested = module.replaceAll('\\', '/').replace(/^\.\//, '');
  const relativeModule = relative(understanding.target, resolve(understanding.target, module)).replaceAll('\\', '/');
  const node = understanding.graph.nodes.find((candidate) => candidate.id === requested || candidate.id === relativeModule);
  const moduleId = node?.id ?? requested;
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of understanding.graph.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  }
  return {
    version: 1, target: understanding.target, module: moduleId, found: Boolean(node), readOnly: true,
    directDependencies: [...(outgoing.get(moduleId) ?? [])].sort(), dependencies: impactClosure(moduleId, outgoing),
    directDependents: [...(incoming.get(moduleId) ?? [])].sort(), dependents: impactClosure(moduleId, incoming),
    cycles: understanding.graph.cycles.filter((cycle) => cycle.includes(moduleId)),
    limitation: 'Static imports only. Dynamic loading, runtime configuration, framework callbacks, and external consumers may not appear here.'
  };
}
