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
  const ajaxLines = linesMatching(content, /['"]wp_ajax(?:_nopriv)?_/);
  if (ajaxLines.length > 0 && !/\b(?:check_ajax_referer|wp_verify_nonce)\s*\(/.test(content)) findings.push({ id: `wordpress-ajax-nonce-review:${displayPath}`, ruleId: 'wordpress-ajax-nonce-review', severity: 'medium', risk: 'architectural', file: displayPath, lines: ajaxLines, evidence: 'WordPress AJAX action(s) found without a local nonce verification call. Confirm CSRF protection in the registered callback before release.', scoreImpact: 5 });
  if (ajaxLines.length > 0 && !/\bcurrent_user_can\s*\(/.test(content)) findings.push({ id: `wordpress-ajax-capability-review:${displayPath}`, ruleId: 'wordpress-ajax-capability-review', severity: 'medium', risk: 'architectural', file: displayPath, lines: ajaxLines, evidence: 'WordPress AJAX action(s) found without a local capability check. Confirm authorization in the registered callback before release.', scoreImpact: 5 });
  const rawInputLines = linesMatching(content, /\$_(?:GET|POST|REQUEST|COOKIE)\s*\[/).filter((line) => !/\b(?:sanitize_|absint|intval|floatval|wp_kses|esc_)/.test(content.split(/\r?\n/)[line - 1]));
  if (rawInputLines.length > 0) findings.push({ id: `wordpress-unsanitized-input:${displayPath}`, ruleId: 'wordpress-unsanitized-input', severity: 'medium', risk: 'architectural', file: displayPath, lines: rawInputLines, evidence: `${rawInputLines.length} request input use(s) appear without same-line sanitization. Trace validation and sanitization before using or storing the value.`, scoreImpact: Math.min(rawInputLines.length * 3, 12) });
  const rawOutputLines = linesMatching(content, /\becho\s+\$\w+/).filter((line) => !/\besc_(?:html|attr|url|js|textarea)|wp_kses/.test(content.split(/\r?\n/)[line - 1]));
  if (rawOutputLines.length > 0) findings.push({ id: `wordpress-unescaped-output:${displayPath}`, ruleId: 'wordpress-unescaped-output', severity: 'medium', risk: 'architectural', file: displayPath, lines: rawOutputLines, evidence: `${rawOutputLines.length} output line(s) echo a variable without visible escaping. Confirm contextual escaping before rendering untrusted data.`, scoreImpact: Math.min(rawOutputLines.length * 3, 12) });
  return findings;
}
