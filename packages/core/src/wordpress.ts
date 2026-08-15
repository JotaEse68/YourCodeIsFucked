import type { Finding } from './types.js';

export interface WordPressSource { path: string; content: string; }

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
  const rawInputLines = linesMatching(content, /\$_(?:GET|POST|REQUEST|COOKIE)\s*\[/).filter((line) => !/\b(?:sanitize_|absint|intval|floatval|wp_kses|esc_)/.test(content.split(/\r?\n/)[line - 1]));
  if (rawInputLines.length > 0) findings.push({ id: `wordpress-unsanitized-input:${displayPath}`, ruleId: 'wordpress-unsanitized-input', severity: 'medium', risk: 'architectural', file: displayPath, lines: rawInputLines, evidence: `${rawInputLines.length} request input use(s) appear without same-line sanitization. Trace validation and sanitization before using or storing the value.`, scoreImpact: Math.min(rawInputLines.length * 3, 12) });
  const rawOutputLines = linesMatching(content, /\becho\s+\$\w+/).filter((line) => !/\besc_(?:html|attr|url|js|textarea)|wp_kses/.test(content.split(/\r?\n/)[line - 1]));
  if (rawOutputLines.length > 0) findings.push({ id: `wordpress-unescaped-output:${displayPath}`, ruleId: 'wordpress-unescaped-output', severity: 'medium', risk: 'architectural', file: displayPath, lines: rawOutputLines, evidence: `${rawOutputLines.length} output line(s) echo a variable without visible escaping. Confirm contextual escaping before rendering untrusted data.`, scoreImpact: Math.min(rawOutputLines.length * 3, 12) });
  return findings;
}

interface AjaxRegistration { action: string; callback: string; file: string; line: number; public: boolean; }
interface CallbackDefinition { file: string; line: number; body: string; }

function callbackDefinitions(sources: WordPressSource[]): Map<string, CallbackDefinition> {
  const definitions = new Map<string, CallbackDefinition>();
  for (const source of sources) {
    const expression = /\bfunction\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g;
    for (const match of source.content.matchAll(expression)) {
      const openBrace = (match.index ?? 0) + match[0].lastIndexOf('{');
      let depth = 0;
      let end = openBrace;
      for (; end < source.content.length; end += 1) {
        if (source.content[end] === '{') depth += 1;
        if (source.content[end] === '}') depth -= 1;
        if (depth === 0) break;
      }
      if (depth === 0 && !definitions.has(match[1])) definitions.set(match[1], { file: source.path, line: lineAt(source.content, match.index ?? 0), body: source.content.slice(openBrace, end + 1) });
    }
  }
  return definitions;
}

function ajaxRegistrations(sources: WordPressSource[]): AjaxRegistration[] {
  const registrations: AjaxRegistration[] = [];
  const expression = /\badd_action\s*\(\s*(['"])(wp_ajax(_nopriv)?_[A-Za-z0-9_-]+)\1\s*,\s*(['"])([A-Za-z_]\w*)\4/g;
  for (const source of sources) for (const match of source.content.matchAll(expression)) registrations.push({ action: match[2], callback: match[5], file: source.path, line: lineAt(source.content, match.index ?? 0), public: Boolean(match[3]) });
  return registrations;
}

/** Resolves simple named AJAX callbacks across PHP files before checking nonce and capability evidence. */
export function wordpressAjaxFindings(sources: WordPressSource[]): Finding[] {
  const definitions = callbackDefinitions(sources);
  const findings: Finding[] = [];
  const reviewed = new Set<string>();
  for (const registration of ajaxRegistrations(sources)) {
    const callback = definitions.get(registration.callback);
    const key = `${registration.action}:${registration.callback}`;
    if (reviewed.has(key)) continue;
    reviewed.add(key);
    const location = callback ? { file: callback.file, lines: [callback.line] } : { file: registration.file, lines: [registration.line] };
    const callbackEvidence = callback ? `Callback ${registration.callback} resolved from ${registration.file}:${registration.line}.` : `Callback ${registration.callback} could not be resolved from ${registration.file}:${registration.line}; it may be defined dynamically or in a file YCF cannot inspect.`;
    if (!callback || !/\b(?:check_ajax_referer|wp_verify_nonce)\s*\(/.test(callback.body)) findings.push({ id: `wordpress-ajax-nonce-review:${registration.action}:${registration.callback}`, ruleId: 'wordpress-ajax-nonce-review', severity: 'medium', risk: 'architectural', ...location, evidence: `${callbackEvidence} Confirm nonce verification in the registered callback before release.`, scoreImpact: 5 });
    // Public wp_ajax_nopriv endpoints intentionally have no logged-in user capability to check.
    if (!registration.public && (!callback || !/\bcurrent_user_can\s*\(/.test(callback.body))) findings.push({ id: `wordpress-ajax-capability-review:${registration.action}:${registration.callback}`, ruleId: 'wordpress-ajax-capability-review', severity: 'medium', risk: 'architectural', ...location, evidence: `${callbackEvidence} Confirm authorization with current_user_can in the registered callback before release.`, scoreImpact: 5 });
  }
  return findings;
}
