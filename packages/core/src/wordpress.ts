import type { Finding } from './types.js';

function lineAt(content: string, offset: number): number { return content.slice(0, offset).split(/\r?\n/).length; }
function linesMatching(content: string, expression: RegExp): number[] {
  return content.split(/\r?\n/).flatMap((line, index) => expression.test(line) ? [index + 1] : []);
}

/** Documents dynamic WordPress entry points so other analyzers never classify them as dead by static references alone. */
export function wordpressFindings(displayPath: string, content: string): Finding[] {
  const entries = [
    { label: 'hooks/filters/shortcodes', expression: /\badd_(?:action|filter|shortcode)\s*\(/ },
    { label: 'REST routes', expression: /\bregister_rest_route\s*\(/ },
    { label: 'AJAX actions', expression: /['"]wp_ajax(?:_nopriv)?_/ },
    { label: 'cron jobs', expression: /\bwp_schedule_(?:event|single_event)\s*\(/ },
    { label: 'WooCommerce hooks', expression: /['"]woocommerce_/ }
  ];
  const dynamicLines = entries.flatMap((entry) => linesMatching(content, entry.expression));
  const findings: Finding[] = [];
  if (dynamicLines.length > 0) {
    const detected = entries.filter((entry) => linesMatching(content, entry.expression).length > 0).map((entry) => entry.label);
    findings.push({ id: `wordpress-dynamic-entrypoint:${displayPath}`, ruleId: 'wordpress-dynamic-entrypoint', severity: 'low', risk: 'architectural', file: displayPath, lines: [...new Set(dynamicLines)].sort((left, right) => left - right), evidence: `Dynamic WordPress entry point(s) detected: ${detected.join(', ')}. These callbacks must not be treated as dead code from static references alone.`, scoreImpact: 0 });
  }
  const routesWithoutPermissions = [...content.matchAll(/\bregister_rest_route\s*\([\s\S]{0,2000}?\);/g)].flatMap((route) => route[0].includes('permission_callback') ? [] : [lineAt(content, route.index ?? 0)]);
  if (routesWithoutPermissions.length > 0) findings.push({ id: `wordpress-rest-route-permission:${displayPath}`, ruleId: 'wordpress-rest-route-permission', severity: 'medium', risk: 'architectural', file: displayPath, lines: routesWithoutPermissions, evidence: `${routesWithoutPermissions.length} WordPress REST route(s) appear to lack a permission_callback. Confirm access control before release.`, scoreImpact: Math.min(routesWithoutPermissions.length * 5, 15) });
  return findings;
}
