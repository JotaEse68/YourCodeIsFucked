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
  const rawInputLines = linesMatching(content, /\$_(?:GET|POST|REQUEST|COOKIE)\s*\[/).filter((line) => !/\b(?:sanitize_|absint|intval|floatval|wp_kses|esc_)/.test(content.split(/\r?\n/)[line - 1]));
  if (rawInputLines.length > 0) findings.push({ id: `wordpress-unsanitized-input:${displayPath}`, ruleId: 'wordpress-unsanitized-input', severity: 'medium', risk: 'architectural', file: displayPath, lines: rawInputLines, evidence: `${rawInputLines.length} request input use(s) appear without same-line sanitization. Trace validation and sanitization before using or storing the value.`, scoreImpact: Math.min(rawInputLines.length * 3, 12) });
  const rawOutputLines = linesMatching(content, /\becho\s+\$\w+/).filter((line) => !/\besc_(?:html|attr|url|js|textarea)|wp_kses/.test(content.split(/\r?\n/)[line - 1]));
  if (rawOutputLines.length > 0) findings.push({ id: `wordpress-unescaped-output:${displayPath}`, ruleId: 'wordpress-unescaped-output', severity: 'medium', risk: 'architectural', file: displayPath, lines: rawOutputLines, evidence: `${rawOutputLines.length} output line(s) echo a variable without visible escaping. Confirm contextual escaping before rendering untrusted data.`, scoreImpact: Math.min(rawOutputLines.length * 3, 12) });
  return findings;
}

interface AjaxRegistration { action: string; callback: string; file: string; line: number; public: boolean; }
interface CallbackDefinition { file: string; line: number; body: string; }

function instanceClasses(sources: WordPressSource[]): Map<string, string> {
  const instances = new Map<string, string>();
  for (const source of sources) for (const match of source.content.matchAll(/\$([A-Za-z_]\w*)\s*=\s*new\s+([A-Za-z_]\w*)\s*\(/g)) if (!instances.has(match[1])) instances.set(match[1], match[2]);
  return instances;
}

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
    const classes = /\bclass\s+([A-Za-z_]\w*)[^{}]*\{/g;
    for (const classMatch of source.content.matchAll(classes)) {
      const classOpenBrace = (classMatch.index ?? 0) + classMatch[0].lastIndexOf('{');
      let classDepth = 0;
      let classEnd = classOpenBrace;
      for (; classEnd < source.content.length; classEnd += 1) {
        if (source.content[classEnd] === '{') classDepth += 1;
        if (source.content[classEnd] === '}') classDepth -= 1;
        if (classDepth === 0) break;
      }
      if (classDepth !== 0) continue;
      const classBody = source.content.slice(classOpenBrace + 1, classEnd);
      const methods = /\bfunction\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g;
      for (const methodMatch of classBody.matchAll(methods)) {
        const methodOpenBrace = classOpenBrace + 1 + (methodMatch.index ?? 0) + methodMatch[0].lastIndexOf('{');
        let methodDepth = 0;
        let methodEnd = methodOpenBrace;
        for (; methodEnd < source.content.length; methodEnd += 1) {
          if (source.content[methodEnd] === '{') methodDepth += 1;
          if (source.content[methodEnd] === '}') methodDepth -= 1;
          if (methodDepth === 0) break;
        }
        const key = `${classMatch[1]}::${methodMatch[1]}`;
        if (methodDepth === 0 && !definitions.has(key)) definitions.set(key, { file: source.path, line: lineAt(source.content, classOpenBrace + 1 + (methodMatch.index ?? 0)), body: source.content.slice(methodOpenBrace, methodEnd + 1) });
      }
    }
  }
  return definitions;
}

function ajaxRegistrations(sources: WordPressSource[], instances: Map<string, string>): AjaxRegistration[] {
  const registrations: AjaxRegistration[] = [];
  const expression = /\badd_action\s*\(\s*(['"])(wp_ajax(_nopriv)?_[A-Za-z0-9_-]+)\1\s*,\s*(['"])([A-Za-z_]\w*(?:::[A-Za-z_]\w*)?)\4/g;
  for (const source of sources) for (const match of source.content.matchAll(expression)) registrations.push({ action: match[2], callback: match[5], file: source.path, line: lineAt(source.content, match.index ?? 0), public: Boolean(match[3]) });
  const arrayExpression = /\badd_action\s*\(\s*(['"])(wp_ajax(_nopriv)?_[A-Za-z0-9_-]+)\1\s*,\s*(?:array\s*\(|\[)\s*(['"])([A-Za-z_]\w*)\4\s*,\s*(['"])([A-Za-z_]\w*)\6/g;
  for (const source of sources) for (const match of source.content.matchAll(arrayExpression)) registrations.push({ action: match[2], callback: `${match[5]}::${match[7]}`, file: source.path, line: lineAt(source.content, match.index ?? 0), public: Boolean(match[3]) });
  const classExpression = /\badd_action\s*\(\s*(['"])(wp_ajax(_nopriv)?_[A-Za-z0-9_-]+)\1\s*,\s*(?:array\s*\(|\[)\s*([A-Za-z_]\w*)::class\s*,\s*(['"])([A-Za-z_]\w*)\5/g;
  for (const source of sources) for (const match of source.content.matchAll(classExpression)) registrations.push({ action: match[2], callback: `${match[4]}::${match[6]}`, file: source.path, line: lineAt(source.content, match.index ?? 0), public: Boolean(match[3]) });
  const instanceExpression = /\badd_action\s*\(\s*(['"])(wp_ajax(_nopriv)?_[A-Za-z0-9_-]+)\1\s*,\s*(?:array\s*\(|\[)\s*\$([A-Za-z_]\w*)\s*,\s*(['"])([A-Za-z_]\w*)\5/g;
  for (const source of sources) for (const match of source.content.matchAll(instanceExpression)) {
    const className = instances.get(match[4]);
    if (className) registrations.push({ action: match[2], callback: `${className}::${match[6]}`, file: source.path, line: lineAt(source.content, match.index ?? 0), public: Boolean(match[3]) });
  }
  return registrations;
}

function referencedCallback(route: string, key: 'callback' | 'permission_callback', instances: Map<string, string>): string | undefined {
  const prefix = `['"]${key}['"]\\s*=>\\s*`;
  const direct = new RegExp(`${prefix}['"]([A-Za-z_]\\w*(?:::[A-Za-z_]\\w*)?)['"]`).exec(route);
  if (direct) return direct[1];
  const array = new RegExp(`${prefix}(?:array\\s*\\(|\\[)\\s*['"]([A-Za-z_]\\w*)['"]\\s*,\\s*['"]([A-Za-z_]\\w*)['"]`).exec(route);
  if (array) return `${array[1]}::${array[2]}`;
  const classCallback = new RegExp(`${prefix}(?:array\\s*\\(|\\[)\\s*([A-Za-z_]\\w*)::class\\s*,\\s*['"]([A-Za-z_]\\w*)['"]`).exec(route);
  if (classCallback) return `${classCallback[1]}::${classCallback[2]}`;
  const instanceCallback = new RegExp(`${prefix}(?:array\\s*\\(|\\[)\\s*\\$([A-Za-z_]\\w*)\\s*,\\s*['"]([A-Za-z_]\\w*)['"]`).exec(route);
  return instanceCallback && instances.has(instanceCallback[1]) ? `${instances.get(instanceCallback[1])}::${instanceCallback[2]}` : undefined;
}

/** Checks REST access declarations and resolves explicit named route callbacks across inspected PHP files. */
export function wordpressRestFindings(sources: WordPressSource[]): Finding[] {
  const definitions = callbackDefinitions(sources);
  const instances = instanceClasses(sources);
  const findings: Finding[] = [];
  for (const source of sources) for (const route of source.content.matchAll(/\bregister_rest_route\s*\([\s\S]{0,2000}?\);/g)) {
    const line = lineAt(source.content, route.index ?? 0);
    if (!route[0].includes('permission_callback')) {
      findings.push({ id: `wordpress-rest-route-permission:${source.path}:${line}`, ruleId: 'wordpress-rest-route-permission', severity: 'medium', risk: 'architectural', file: source.path, lines: [line], evidence: 'A WordPress REST route appears to lack a permission_callback. Confirm access control before release.', scoreImpact: 5 });
      continue;
    }
    const permission = referencedCallback(route[0], 'permission_callback', instances);
    const publicRoute = /['"]permission_callback['"]\s*=>\s*['"]__return_true['"]/.test(route[0]);
    const protectedRoute = Boolean(permission && /\bcurrent_user_can\s*\(/.test(definitions.get(permission)?.body ?? '')) || /['"]permission_callback['"]\s*=>\s*function[\s\S]{0,1000}?\bcurrent_user_can\s*\(/.test(route[0]);
    if (publicRoute) findings.push({ id: `wordpress-rest-route-public:${source.path}:${line}`, ruleId: 'wordpress-rest-route-public', severity: 'low', risk: 'architectural', file: source.path, lines: [line], evidence: 'REST route is explicitly public through permission_callback => __return_true. Confirm that public exposure, rate limits, and returned data are intentional.', scoreImpact: 0 });
    else if (protectedRoute) findings.push({ id: `wordpress-rest-route-protected:${source.path}:${line}`, ruleId: 'wordpress-rest-route-protected', severity: 'low', risk: 'architectural', file: source.path, lines: [line], evidence: `REST route permission callback ${permission ?? 'closure'} contains a current_user_can check. Access is statically classified as protected.`, scoreImpact: 0 });
    else findings.push({ id: `wordpress-rest-route-permission-review:${source.path}:${line}`, ruleId: 'wordpress-rest-route-permission-review', severity: 'medium', risk: 'architectural', file: source.path, lines: [line], evidence: 'REST route declares a permission_callback, but YCF cannot prove a current_user_can check. Review the callback and access policy before release.', scoreImpact: 3 });
    const callback = referencedCallback(route[0], 'callback', instances);
    if (callback && !definitions.has(callback)) findings.push({ id: `wordpress-rest-route-callback-review:${source.path}:${line}`, ruleId: 'wordpress-rest-route-callback-review', severity: 'medium', risk: 'architectural', file: source.path, lines: [line], evidence: `REST callback ${callback} could not be resolved in inspected PHP files. Confirm that this route will be callable after deployment.`, scoreImpact: 3 });
    if (!callback && /['"]callback['"]\s*=>/.test(route[0])) findings.push({ id: `wordpress-dynamic-callback-review:rest:${source.path}:${line}`, ruleId: 'wordpress-dynamic-callback-review', severity: 'low', risk: 'architectural', file: source.path, lines: [line], evidence: 'REST route uses a dynamic or closure callback that YCF cannot prove statically. Confirm its loading and access controls before release.', scoreImpact: 0 });
  }
  return findings;
}

/** Resolves simple named AJAX callbacks across PHP files before checking nonce and capability evidence. */
export function wordpressAjaxFindings(sources: WordPressSource[]): Finding[] {
  const definitions = callbackDefinitions(sources);
  const instances = instanceClasses(sources);
  const findings: Finding[] = [];
  const reviewed = new Set<string>();
  for (const registration of ajaxRegistrations(sources, instances)) {
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
  for (const source of sources) for (const match of source.content.matchAll(/\badd_action\s*\(\s*(['"])(wp_ajax(?:_nopriv)?_[A-Za-z0-9_-]+)\1\s*,\s*(?:function\b|\$[A-Za-z_]\w*)/g)) {
    const line = lineAt(source.content, match.index ?? 0);
    findings.push({ id: `wordpress-dynamic-callback-review:ajax:${source.path}:${line}`, ruleId: 'wordpress-dynamic-callback-review', severity: 'low', risk: 'architectural', file: source.path, lines: [line], evidence: 'AJAX action uses a closure or runtime callback. YCF cannot prove its nonce or authorization checks statically; review the callback before release.', scoreImpact: 0 });
  }
  for (const source of sources) for (const match of source.content.matchAll(/\badd_action\s*\(\s*(['"])(wp_ajax(?:_nopriv)?_[A-Za-z0-9_-]+)\1\s*,\s*(?:array\s*\(|\[)\s*\$([A-Za-z_]\w*)\s*,/g)) {
    if (instances.has(match[4])) continue;
    const line = lineAt(source.content, match.index ?? 0);
    findings.push({ id: `wordpress-dynamic-callback-review:ajax-instance:${source.path}:${line}`, ruleId: 'wordpress-dynamic-callback-review', severity: 'low', risk: 'architectural', file: source.path, lines: [line], evidence: `AJAX action uses instance $${match[4]}, but YCF cannot link it to a class created with new. Review the callback, nonce, and authorization before release.`, scoreImpact: 0 });
  }
  return findings;
}
