import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { aiResidueFindings, audit, cleanupDebugStatements, cleanupDevArtifacts, dependencyAuditPlan, detectStacks, duplicateGroups, loadConfig, parseDependencyAudit, refactorPlan, releaseCheckLabel, releaseReadiness, understand, verificationPlan, writeAuditReport, writeReleaseReport, writeUnfuckReport } from './index.js';

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('stack detection', () => {
  it('detects TypeScript and React from a Node package', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"dependencies":{"react":"19.0.0","typescript":"5.0.0"}}');
    writeFileSync(join(directory, 'tsconfig.json'), '{}');
    expect(detectStacks(directory)).toEqual(['javascript', 'typescript', 'react']);
  });

  it('keeps audit read-only and returns deterministic findings and a score', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'index.js'), 'debugger;');
    const report = audit(directory);
    expect(report.readOnly).toBe(true);
    expect(report.sourceFiles).toBe(1);
    expect(report.findings).toMatchObject([{ ruleId: 'debug-statements', risk: 'auto', lines: [1], scoreImpact: 2 }]);
    expect(report.score).toMatchObject({ fucked: 2, health: 98, method: 'deterministic-v1' });
  });

  it('reports residue instead of automatically deleting it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'service.ts'), '// temporary fix: remove after migration');
    const [finding] = audit(directory).findings;
    expect(finding).toMatchObject({ ruleId: 'ai-residue', risk: 'report-only', lines: [1] });
  });

  it('finds suspicious iterative filenames without touching the file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'checkout-final-final.ts');
    writeFileSync(path, 'export const checkout = true;');
    expect(aiResidueFindings(directory)).toMatchObject([{ ruleId: 'suspicious-filename', file: 'checkout-final-final.ts', risk: 'report-only' }]);
    expect(existsSync(path)).toBe(true);
  });

  it('removes only parser-confirmed debugger statements and preserves comments', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'service.ts');
    writeFileSync(path, '// debugger; must remain a comment\nexport function run() { debugger; return true; }');
    expect(cleanupDebugStatements(directory)).toMatchObject({ removedDebugStatements: 1, changedFiles: [{ file: 'service.ts', removedDebugStatements: 1 }] });
    expect(readFileSync(path, 'utf8')).toBe('// debugger; must remain a comment\nexport function run() {  return true; }');
  });

  it('removes only literal debug console calls and preserves calls with possible effects', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'log.ts');
    writeFileSync(path, "console.debug('inspect');\nconsole.log('[debug] state', 1);\nconsole.debug(loadState());\nconsole.log('production log', 1);");
    expect(audit(directory).findings).toMatchObject([{ ruleId: 'debug-console', risk: 'auto', lines: [1, 2] }]);
    expect(cleanupDevArtifacts(directory)).toMatchObject({ removedDebugStatements: 0, removedDebugConsoleCalls: 2 });
    expect(readFileSync(path, 'utf8')).toBe("\n\nconsole.debug(loadState());\nconsole.log('production log', 1);");
  });

  it('removes one unused named import while preserving the module import and single-binding imports', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'imports.ts');
    writeFileSync(path, "import { unused, used } from './module';\nimport { sideEffectOnly } from './side-effect';\nused();");
    expect(audit(directory).findings).toMatchObject([{ ruleId: 'unused-import', risk: 'auto', lines: [1] }]);
    expect(cleanupDevArtifacts(directory)).toMatchObject({ removedUnusedImports: 1 });
    expect(readFileSync(path, 'utf8')).toBe("import { used } from './module';\nimport { sideEffectOnly } from './side-effect';\nused();");
  });

  it('reports oversized React components and effects without dependencies without changing them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_function_lines: 3\n');
    writeFileSync(join(directory, 'Dashboard.tsx'), [
      "import { useEffect } from 'react';",
      'export function Dashboard() {',
      '  useEffect(() => { loadDashboard(); });',
      "  const heading = 'Dashboard';",
      '  return <section>{heading}</section>;',
      '}'
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('long-function');
    expect(rules).toContain('large-react-component');
    expect(rules).toContain('react-effect-without-dependencies');
  });

  it('reports async React effects without visible cleanup but accepts returned cleanup', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'Profile.tsx');
    const source = [
      "import { useEffect } from 'react';",
      'export function Profile() {',
      '  useEffect(() => { fetch("/profile").then(showProfile); }, []);',
      '  useEffect(() => {',
      '    const controller = new AbortController();',
      '    fetch("/settings", { signal: controller.signal }).then(showSettings);',
      '    return () => controller.abort();',
      '  }, []);',
      '  return <main />;',
      '}'
    ].join('\n');
    writeFileSync(path, source);
    expect(audit(directory).findings).toContainEqual(expect.objectContaining({ ruleId: 'react-async-effect-without-cleanup', lines: [3], risk: 'report-only' }));
    expect(readFileSync(path, 'utf8')).toBe(source);
  });

  it('recognizes WordPress hooks only inside PHP files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'plugin.php'), '<?php add_action("init", "ycf_boot");');
    expect(detectStacks(directory)).toEqual(['php', 'wordpress']);
  });

  it('protects dynamic WordPress entry points and flags REST routes without permission callbacks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'plugin.php'), [
      '<?php',
      "add_action('init', 'boot_plugin');",
      "add_shortcode('widget', 'render_widget');",
      "add_action('wp_ajax_save_widget', 'save_widget');",
      "wp_schedule_event(time(), 'daily', 'refresh_widget');",
      "register_rest_route('ycf/v1', '/widget', array('methods' => 'GET', 'callback' => 'get_widget'));"
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);

    expect(rules).toContain('wordpress-dynamic-entrypoint');
    expect(rules).toContain('wordpress-rest-route-permission');
    expect(rules).toContain('wordpress-ajax-nonce-review');
    expect(rules).toContain('wordpress-ajax-capability-review');
  });

  it('reports WordPress AJAX and request-data security checks without changing source', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'ajax.php');
    writeFileSync(path, [
      '<?php',
      "add_action('wp_ajax_save_profile', 'save_profile');",
      "$name = $_POST['name'];",
      'echo $name;'
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('wordpress-ajax-nonce-review');
    expect(rules).toContain('wordpress-ajax-capability-review');
    expect(rules).toContain('wordpress-unsanitized-input');
    expect(rules).toContain('wordpress-unescaped-output');
    expect(readFileSync(path, 'utf8')).toContain("$_POST['name']");
  });

  it('resolves a WordPress AJAX callback in another file before reporting its security checks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'hooks.php'), "<?php\nadd_action('wp_ajax_save_profile', 'save_profile');");
    writeFileSync(join(directory, 'callbacks.php'), "<?php\nfunction save_profile() {\n  check_ajax_referer('save_profile');\n  current_user_can('edit_posts');\n}");
    const secureRules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(secureRules).not.toContain('wordpress-ajax-nonce-review');
    expect(secureRules).not.toContain('wordpress-ajax-capability-review');

    writeFileSync(join(directory, 'callbacks.php'), "<?php\nfunction save_profile() {\n  save_profile_data();\n}");
    const findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-ajax-nonce-review' || finding.ruleId === 'wordpress-ajax-capability-review');
    expect(findings).toMatchObject([{ file: 'callbacks.php', lines: [2] }, { file: 'callbacks.php', lines: [2] }]);
  });

  it('resolves class callbacks for WordPress AJAX and REST routes across files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'routes.php'), [
      '<?php',
      "add_action('wp_ajax_save_profile', array('Profile_Controller', 'save'));",
      "register_rest_route('ycf/v1', '/profile', array('callback' => array('Profile_Controller', 'show'), 'permission_callback' => 'can_read_profile'));"
    ].join('\n'));
    writeFileSync(join(directory, 'controller.php'), [
      '<?php',
      'class Profile_Controller {',
      '  function save() { check_ajax_referer(\'save\'); current_user_can(\'edit_posts\'); }',
      '  function show() { return array(); }',
      '}'
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).not.toContain('wordpress-ajax-nonce-review');
    expect(rules).not.toContain('wordpress-ajax-capability-review');
    expect(rules).not.toContain('wordpress-rest-route-callback-review');
  });

  it('confirms explicit WordPress class and instance callbacks while marking closures for review', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'hooks.php'), [
      '<?php',
      '$controller = new Profile_Controller();',
      "add_action('wp_ajax_static', [Profile_Controller::class, 'save']);",
      "add_action('wp_ajax_instance', [$controller, 'save']);",
      "add_action('wp_ajax_closure', function () { save_profile(); });",
      "add_action('wp_ajax_unknown_instance', [$unknown_controller, 'save']);"
    ].join('\n'));
    writeFileSync(join(directory, 'controller.php'), [
      '<?php', 'class Profile_Controller {',
      "  function save() { check_ajax_referer('save'); current_user_can('edit_posts'); }", '}'
    ].join('\n'));
    const findings = audit(directory).findings;
    expect(findings.filter((finding) => finding.ruleId === 'wordpress-ajax-nonce-review' || finding.ruleId === 'wordpress-ajax-capability-review')).toEqual([]);
    expect(findings).toContainEqual(expect.objectContaining({ ruleId: 'wordpress-dynamic-callback-review', file: 'hooks.php', lines: [5], scoreImpact: 0 }));
    expect(findings).toContainEqual(expect.objectContaining({ ruleId: 'wordpress-dynamic-callback-review', file: 'hooks.php', lines: [6], scoreImpact: 0 }));
  });

  it('classifies WordPress REST access as public, protected, or requiring review', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'routes.php'), [
      '<?php',
      "register_rest_route('ycf/v1', '/public', array('callback' => 'public_route', 'permission_callback' => '__return_true'));",
      "register_rest_route('ycf/v1', '/protected', array('callback' => 'protected_route', 'permission_callback' => 'can_manage_route'));",
      "register_rest_route('ycf/v1', '/review', array('callback' => 'review_route', 'permission_callback' => 'custom_policy'));",
      'function public_route() {}', 'function protected_route() {}', 'function review_route() {}',
      "function can_manage_route() { return current_user_can('manage_options'); }",
      'function custom_policy() { return policy_from_service(); }'
    ].join('\n'));
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('wordpress-rest-route-public');
    expect(rules).toContain('wordpress-rest-route-protected');
    expect(rules).toContain('wordpress-rest-route-permission-review');
  });

  it('traces raw AJAX input into an escaped helper in another PHP file without claiming input is sanitized', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'hooks.php'), [
      '<?php', "add_action('wp_ajax_render_profile', 'render_profile_callback');",
      "function render_profile_callback() { check_ajax_referer('profile'); current_user_can('read'); $name = $_POST['name']; render_profile($name); }"
    ].join('\n'));
    writeFileSync(join(directory, 'view.php'), "<?php\nfunction render_profile($name) { echo esc_html($name); }");
    const flow = audit(directory).findings.find((finding) => finding.ruleId === 'wordpress-cross-file-data-flow-review');
    expect(flow).toMatchObject({ file: 'hooks.php', risk: 'architectural', scoreImpact: 0 });
    expect(flow?.evidence).toContain('visible WordPress escaping');
    expect(audit(directory).findings.map((finding) => finding.ruleId)).toContain('wordpress-unsanitized-input');
  });

  it('traces a REST request value into cross-file persistence and accepts visible sanitization', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'routes.php'), [
      '<?php',
      "register_rest_route('ycf/v1', '/profile', array('callback' => 'save_profile', 'permission_callback' => 'can_save_profile'));",
      "function save_profile($request) { $name = $request->get_param('name'); persist_profile($name); }",
      "function can_save_profile() { return current_user_can('edit_posts'); }"
    ].join('\n'));
    const storage = join(directory, 'storage.php');
    writeFileSync(storage, "<?php\nfunction persist_profile($name) { update_option('profile_name', $name); }");
    let findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-rest-persistence-review');
    expect(findings).toMatchObject([{ file: 'routes.php', risk: 'architectural', scoreImpact: 4 }]);
    writeFileSync(storage, "<?php\nfunction persist_profile($name) { update_option('profile_name', sanitize_text_field($name)); }");
    findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-rest-persistence-review');
    expect(findings).toEqual([]);
  });

  it('recommends a conservative sanitizer from a REST value name without applying it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'routes.php'), [
      '<?php',
      "register_rest_route('ycf/v1', '/email', array('callback' => 'save_email', 'permission_callback' => 'can_save_email'));",
      "function save_email($request) { $email = $request->get_param('email'); update_option('contact_email', $email); }",
      "function can_save_email() { return current_user_can('manage_options'); }"
    ].join('\n'));
    const finding = audit(directory).findings.find((item) => item.ruleId === 'wordpress-rest-persistence-review');
    expect(finding?.evidence).toContain('sanitize_email + is_email');
  });

  it('reports direct variable interpolation in $wpdb SQL but accepts $wpdb->prepare', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'database.php'), [
      '<?php',
      '$wpdb->query("DELETE FROM wp_profiles WHERE id = $id");',
      "$wpdb->get_results('SELECT * FROM wp_profiles WHERE email = ' . $email);",
      "$wpdb->query($wpdb->prepare('DELETE FROM wp_profiles WHERE id = %d', $safe_id));"
    ].join('\n'));
    const findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-wpdb-unprepared-query');
    expect(findings).toMatchObject([{ lines: [2, 3], severity: 'medium', scoreImpact: 10 }]);
  });

  it('requires proven protection for destructive WordPress AJAX and REST callbacks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'dangerous.php');
    writeFileSync(path, [
      '<?php',
      "add_action('wp_ajax_delete_account', 'delete_account');",
      "register_rest_route('ycf/v1', '/delete', array('callback' => 'delete_post_route', 'permission_callback' => '__return_true'));",
      'function delete_account() { wp_delete_user(42); }',
      'function delete_post_route() { wp_delete_post(7, true); }'
    ].join('\n'));
    let findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-destructive-operation-review');
    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.lines[0])).toEqual([4, 5]);
    writeFileSync(path, [
      '<?php',
      "add_action('wp_ajax_delete_account', 'delete_account');",
      "register_rest_route('ycf/v1', '/delete', array('callback' => 'delete_post_route', 'permission_callback' => 'can_delete_post'));",
      "function delete_account() { check_ajax_referer('delete'); current_user_can('delete_users'); wp_delete_user(42); }",
      'function delete_post_route() { wp_delete_post(7, true); }',
      "function can_delete_post() { return current_user_can('delete_posts'); }"
    ].join('\n'));
    findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-destructive-operation-review');
    expect(findings).toEqual([]);
  });

  it('requires a strong capability before endpoint callbacks can grant privileges', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'privileges.php');
    writeFileSync(path, [
      '<?php',
      "add_action('wp_ajax_promote_member', 'promote_member');",
      "register_rest_route('ycf/v1', '/promote', array('callback' => 'promote_route', 'permission_callback' => 'can_edit_posts'));",
      "function promote_member() { check_ajax_referer('promote'); current_user_can('edit_posts'); $user->set_role('administrator'); }",
      "function promote_route() { wp_update_user(array('ID' => 5, 'role' => 'administrator')); }",
      "function can_edit_posts() { return current_user_can('edit_posts'); }"
    ].join('\n'));
    let findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-privilege-escalation-review');
    expect(findings).toHaveLength(2);
    writeFileSync(path, [
      '<?php',
      "add_action('wp_ajax_promote_member', 'promote_member');",
      "register_rest_route('ycf/v1', '/promote', array('callback' => 'promote_route', 'permission_callback' => 'can_promote_users'));",
      "function promote_member() { check_ajax_referer('promote'); current_user_can('promote_users'); $user->set_role('administrator'); }",
      "function promote_route() { wp_update_user(array('ID' => 5, 'role' => 'administrator')); }",
      "function can_promote_users() { return current_user_can('promote_users'); }"
    ].join('\n'));
    findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-privilege-escalation-review');
    expect(findings).toEqual([]);
  });

  it('reports personal data and secrets only when endpoint callbacks return them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'endpoints.php'), [
      '<?php',
      "add_action('wp_ajax_profile', 'profile_response');",
      "register_rest_route('ycf/v1', '/account', array('callback' => 'account_response', 'permission_callback' => 'can_read_account'));",
      "function profile_response() { check_ajax_referer('profile'); current_user_can('read'); wp_send_json_success(array('email' => 'a@example.com', 'api_token' => $token)); }",
      "function account_response() { return array('access_token' => $token); }",
      "function can_read_account() { return current_user_can('read'); }",
      "$email = 'internal@example.com';"
    ].join('\n'));
    const findings = audit(directory).findings.filter((finding) => finding.ruleId === 'wordpress-sensitive-data-exposure');
    expect(findings).toHaveLength(3);
    expect(findings.filter((finding) => finding.severity === 'medium')).toHaveLength(2);
    expect(findings.filter((finding) => finding.severity === 'low')).toHaveLength(1);
  });

  it('reviews production-unsafe WordPress configuration without exposing credential values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'wp-config.php'), [
      '<?php',
      "define('WP_DEBUG', true);", "define('WP_DEBUG_DISPLAY', true);", "define('SCRIPT_DEBUG', true);",
      "define('DB_PASSWORD', 'replace-this-secret');", "define('DISALLOW_FILE_EDIT', false);"
    ].join('\n'));
    const findings = audit(directory).findings;
    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining(['wordpress-production-debug-config', 'wordpress-hardcoded-config-secret', 'wordpress-file-editor-config']));
    expect(findings.map((finding) => finding.evidence).join('\n')).not.toContain('replace-this-secret');
  });

  it('reports sensitive-looking repository files by path without reading their content', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, '.env'), 'TOP_SECRET_VALUE');
    writeFileSync(join(directory, 'id_rsa'), 'PRIVATE_KEY_VALUE');
    writeFileSync(join(directory, 'database-backup.sql'), 'DATABASE_VALUE');
    writeFileSync(join(directory, '.env.example'), 'SAFE_EXAMPLE');
    const findings = audit(directory).findings.filter((finding) => finding.ruleId === 'sensitive-repository-file');
    expect(findings).toHaveLength(3);
    expect(findings.map((finding) => finding.evidence).join('\n')).not.toContain('TOP_SECRET_VALUE');
    expect(findings.map((finding) => finding.evidence).join('\n')).not.toContain('PRIVATE_KEY_VALUE');
  });

  it('distinguishes sensitive files tracked by Git from files protected by .gitignore', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    execFileSync('git', ['init', '--quiet', directory]);
    writeFileSync(join(directory, '.env'), 'TRACKED_SECRET');
    writeFileSync(join(directory, '.env.local'), 'LOCAL_SECRET');
    writeFileSync(join(directory, '.gitignore'), '.env.local\n');
    execFileSync('git', ['-C', directory, 'add', '--force', '.env']);
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('sensitive-repository-file-tracked');
    expect(rules).toContain('sensitive-repository-file-protected');
  });

  it('plans and parses a read-only production dependency audit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"packageManager":"pnpm@11.0.0"}');
    expect(dependencyAuditPlan(directory)).toEqual({ manager: 'pnpm', command: ['corepack', 'pnpm', 'audit', '--json', '--prod'] });
    expect(parseDependencyAudit('{"vulnerabilities":{"demo":{"severity":"high","fixAvailable":true}}}')).toEqual([{ name: 'demo', severity: 'high', fixAvailable: true }]);
  });

  it('honours the configured file-size limit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_file_lines: 2\n');
    writeFileSync(join(directory, 'large.ts'), 'one\ntwo\nthree');
    expect(audit(directory).findings).toMatchObject([{ ruleId: 'large-source-file', lines: [1, 3] }]);
  });

  it('loads the selected language and explanation audience', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'language: pt\naudience: guided\n');
    expect(loadConfig(directory)).toMatchObject({ language: 'pt', audience: 'guided' });
  });

  it('writes an architecture map and persistent audit reports outside source files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"main":"./entry.ts"}');
    writeFileSync(join(directory, 'entry.ts'), "import { value } from './value.js';\nconsole.log(value);");
    writeFileSync(join(directory, 'value.js'), 'export const value = 1;');
    const map = understand(directory);
    const paths = writeAuditReport(directory);
    expect(map.dependencies).toEqual([{ from: 'entry.ts', to: 'value.js' }]);
    expect(map.graph.nodes).toContainEqual({ id: 'entry.ts', file: 'entry.ts', kind: 'entry-point', entryPoint: true });
    expect(existsSync(join(directory, '.ycf', 'architecture.md'))).toBe(true);
    expect(existsSync(paths.jsonPath)).toBe(true);
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('FUCKED SCORE');
  });

  it('detects local dependency cycles so they can be reviewed before refactoring', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'first.ts'), "import { second } from './second.js';\nexport const first = second;");
    writeFileSync(join(directory, 'second.ts'), "import { first } from './first.js';\nexport const second = first;");
    expect(understand(directory).graph.cycles).toEqual([['first.ts', 'second.ts', 'first.ts']]);
  });

  it('reports complexity, exact duplicate blocks and unreferenced production dependencies without changing code', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_complexity: 2\n');
    writeFileSync(join(directory, 'package.json'), '{"dependencies":{"left-pad":"1.0.0"}}');
    const duplicate = [
      'const a = "this exact code block is deliberately long enough to be meaningful";',
      'const b = a.trim();',
      'const c = b.toUpperCase();',
      'const d = c.toLowerCase();',
      'const e = d.slice(0, 10);',
      'export { e };'
    ].join('\n');
    writeFileSync(join(directory, 'first.js'), `${duplicate}\nfunction branch() { if (one && two) { three(); } }`);
    writeFileSync(join(directory, 'second.js'), duplicate);
    const rules = audit(directory).findings.map((finding) => finding.ruleId);
    expect(rules).toContain('high-complexity');
    expect(rules).toContain('duplicate-code');
    expect(rules).toContain('unused-production-dependency');
    expect(duplicateGroups(directory, [join(directory, 'first.js'), join(directory, 'second.js')])).toMatchObject([{ lines: 6, occurrences: [{ file: 'first.js', startLine: 1 }, { file: 'second.js', startLine: 1 }] }]);
  });

  it('reports structurally similar duplicate blocks as likely and never changes them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const first = join(directory, 'email.js');
    const second = join(directory, 'username.js');
    const emailSource = [
      'function normalizeEmail(email) {',
      '  const cleanEmail = email.trim();',
      "  if (!cleanEmail.includes('@')) throw new Error('invalid email');",
      '  const loweredEmail = cleanEmail.toLowerCase();',
      '  return loweredEmail;',
      '}'
    ].join('\n');
    const usernameSource = [
      'function normalizeUsername(username) {',
      '  const cleanUsername = username.trim();',
      "  if (!cleanUsername.includes('@')) throw new Error('invalid username');",
      '  const loweredUsername = cleanUsername.toLowerCase();',
      '  return loweredUsername;',
      '}'
    ].join('\n');
    writeFileSync(first, emailSource);
    writeFileSync(second, usernameSource);
    expect(duplicateGroups(directory, [first, second])).toMatchObject([{ kind: 'similar', certainty: 'likely', lines: 6, occurrences: [{ file: 'email.js', startLine: 1 }, { file: 'username.js', startLine: 1 }] }]);
    expect(audit(directory).findings).toContainEqual(expect.objectContaining({ ruleId: 'similar-duplicate-code', risk: 'report-only' }));
    expect(readFileSync(first, 'utf8')).toBe(emailSource);
    expect(readFileSync(second, 'utf8')).toBe(usernameSource);
  });

  it('creates a verification plan only for scripts the project declares', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"packageManager":"pnpm@11.0.0","scripts":{"test":"vitest run","build":"tsc"}}');
    expect(verificationPlan(directory)).toMatchObject([
      { name: 'lint', status: 'skipped', output: 'No matching package script.' },
      { name: 'typecheck', status: 'skipped', output: 'No matching package script.' },
      { name: 'test', command: ['corepack', 'pnpm', 'run', 'test'] },
      { name: 'build', command: ['corepack', 'pnpm', 'run', 'build'] }
    ]);
  });

  it('writes a reproducible final report for an unfuck run', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    const auditReport = audit(directory);
    const paths = writeUnfuckReport(directory, {
      target: directory,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      status: 'no-changes',
      before: auditReport,
      after: auditReport
    });
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('NO-CHANGES');
  });

  it('creates a refactor plan with impact information without changing source code', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_function_lines: 2\n');
    const path = join(directory, 'service.ts');
    const source = ['export function processOrder() {', '  const order = loadOrder();', '  validate(order);', '  return save(order);', '}'].join('\n');
    writeFileSync(path, source);
    const result = refactorPlan(directory);
    expect(result.plan.recommendations).toMatchObject([{ title: 'Split an oversized function', file: 'service.ts', requiresHumanReview: true, steps: [{ phase: 'inspect' }, { phase: 'change' }, { phase: 'verify' }] }]);
    expect(result.plan.recommendations[0].stopIf).toEqual(expect.arrayContaining([expect.stringContaining('public API')]));
    expect(readFileSync(path, 'utf8')).toBe(source);
    expect(existsSync(result.markdownPath)).toBe(true);
    expect(readFileSync(result.markdownPath, 'utf8')).toContain('Stop and ask for review if');
    const spanishPlan = refactorPlan(directory, { language: 'es', audience: 'guided' }).plan;
    expect(spanishPlan).toMatchObject({ language: 'es', audience: 'guided' });
    expect(spanishPlan.recommendations[0].steps[0].instruction).toContain('Lee service.ts');
  });

  it('summarizes release readiness and persists a human-readable report', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'README.md'), '# Example');
    const report = releaseReadiness(directory);
    const paths = writeReleaseReport(directory, report);
    expect(report.ready).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({ name: 'verification', status: 'warning' }));
    expect(readFileSync(paths.markdownPath, 'utf8')).toContain('YCF — READY');
    expect(releaseCheckLabel('es', { name: 'git', status: 'failed', detail: 'ignored' })).toContain('crea un commit');
    expect(releaseCheckLabel('fr', { name: 'verification', status: 'failed', detail: 'ignored' })).toContain('ycf verify');
    expect(releaseCheckLabel('zh', { name: 'documentation', status: 'warning', detail: 'ignored' })).toContain('README.md');
  });

  it('keeps dependency advisory checks opt-in and blocks high-risk results', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'README.md'), '# Example');

    expect(releaseReadiness(directory).checks.some((check) => check.name === 'dependencies')).toBe(false);

    const report = releaseReadiness(directory, {
      target: directory,
      auditedAt: new Date().toISOString(),
      manager: 'pnpm',
      command: ['corepack', 'pnpm', 'audit', '--json', '--prod'],
      available: true,
      vulnerabilities: [{ name: 'example-package', severity: 'high', fixAvailable: true }]
    });
    expect(report.ready).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ name: 'dependencies', status: 'failed' }));
  });
});
