import type { Audience, AuditReport, Language, RefactorPlan, RefactorRecommendation, UnderstandReport } from './types.js';

const refactorableRules = new Set(['long-function', 'large-source-file', 'large-react-component', 'high-complexity', 'duplicate-code', 'similar-duplicate-code']);

type Guidance = { inspect: string; change: string; verify: string; stops: string[] };

function guidanceFor(language: Language, audience: Audience): Guidance {
  const concise = audience !== 'guided';
  const copy: Record<Language, Guidance> = {
    en: { inspect: concise ? 'Inspect {location} and every caller before editing.' : 'Read {location}, its callers, and the affected modules before editing. Write down the observable inputs, outputs, errors, and side effects.', change: concise ? '{action} Make one focused change in its own commit.' : '{action} Make one small change in a dedicated commit; keep the old public contract and behavior unless a human explicitly approves a change.', verify: 'Run `ycf verify`, exercise the behavior that uses this code, then run `ycf release` before publishing.', stops: ['Stop if the change would alter a public API, authentication, payments, database schema, stored data, permissions, or externally consumed output.', 'Stop if you cannot explain why every caller will keep the same behavior, including errors and edge cases.', 'Stop if verification fails; restore the last known-good commit and investigate the first failure before continuing.'] },
    es: { inspect: concise ? 'Inspecciona {location} y cada consumidor antes de editar.' : 'Lee {location}, quién lo usa y los módulos afectados antes de editar. Anota entradas, salidas, errores y efectos que se puedan observar.', change: concise ? '{action} Haz un único cambio concreto en su propio commit.' : '{action} Haz un cambio pequeño en un commit propio; conserva el contrato público y el comportamiento salvo aprobación humana explícita.', verify: 'Ejecuta `ycf verify`, prueba el comportamiento que usa este código y ejecuta `ycf release` antes de publicar.', stops: ['Detente si el cambio altera una API pública, autenticación, pagos, esquema o datos de base de datos, permisos o una salida consumida externamente.', 'Detente si no puedes explicar por qué cada consumidor conservará el mismo comportamiento, incluidos errores y casos límite.', 'Detente si falla la verificación; vuelve al último commit correcto e investiga el primer fallo antes de continuar.'] },
    pt: { inspect: concise ? 'Inspecione {location} e cada consumidor antes de editar.' : 'Leia {location}, seus consumidores e os módulos afetados antes de editar. Anote entradas, saídas, erros e efeitos observáveis.', change: concise ? '{action} Faça uma alteração focada em seu próprio commit.' : '{action} Faça uma pequena alteração em um commit próprio; preserve o contrato público e o comportamento sem aprovação humana explícita.', verify: 'Execute `ycf verify`, teste o comportamento que usa este código e execute `ycf release` antes de publicar.', stops: ['Pare se a alteração mudar API pública, autenticação, pagamentos, esquema ou dados do banco, permissões ou saída consumida externamente.', 'Pare se não puder explicar por que cada consumidor manterá o mesmo comportamento.', 'Pare se a verificação falhar; restaure o último commit correto e investigue a primeira falha.'] },
    fr: { inspect: concise ? 'Inspectez {location} et chaque consommateur avant modification.' : 'Lisez {location}, ses consommateurs et les modules concernés avant modification. Notez entrées, sorties, erreurs et effets observables.', change: concise ? '{action} Faites une modification ciblée dans son propre commit.' : '{action} Faites une petite modification dans un commit dédié ; préservez le contrat public et le comportement sans approbation humaine explicite.', verify: 'Lancez `ycf verify`, testez le comportement concerné, puis lancez `ycf release` avant publication.', stops: ['Arrêtez si la modification change une API publique, l’authentification, les paiements, le schéma ou les données de base, les permissions ou une sortie consommée ailleurs.', 'Arrêtez si vous ne pouvez pas expliquer pourquoi chaque consommateur gardera le même comportement.', 'Arrêtez si la vérification échoue ; restaurez le dernier commit valide et examinez le premier échec.'] },
    de: { inspect: concise ? 'Prüfe {location} und jeden Aufrufer vor der Änderung.' : 'Lies {location}, seine Aufrufer und betroffene Module vor der Änderung. Notiere beobachtbare Eingaben, Ausgaben, Fehler und Seiteneffekte.', change: concise ? '{action} Nimm eine gezielte Änderung in einem eigenen Commit vor.' : '{action} Nimm eine kleine Änderung in einem eigenen Commit vor; bewahre öffentlichen Vertrag und Verhalten ohne ausdrückliche menschliche Freigabe.', verify: 'Führe `ycf verify` aus, teste das betroffene Verhalten und führe vor der Veröffentlichung `ycf release` aus.', stops: ['Stoppe, wenn sich öffentliche API, Authentifizierung, Zahlungen, Datenbankschema oder -daten, Berechtigungen oder extern genutzte Ausgaben ändern.', 'Stoppe, wenn du nicht erklären kannst, warum jeder Aufrufer dasselbe Verhalten behält.', 'Stoppe bei fehlgeschlagener Prüfung; stelle den letzten funktionierenden Commit wieder her und untersuche den ersten Fehler.'] },
    it: { inspect: concise ? 'Esamina {location} e ogni utilizzatore prima di modificare.' : 'Leggi {location}, chi lo utilizza e i moduli coinvolti prima di modificare. Annota input, output, errori ed effetti osservabili.', change: concise ? '{action} Fai una modifica mirata nel suo commit.' : '{action} Fai una piccola modifica in un commit dedicato; conserva contratto pubblico e comportamento senza approvazione umana esplicita.', verify: 'Esegui `ycf verify`, prova il comportamento che usa questo codice, poi esegui `ycf release` prima della pubblicazione.', stops: ['Fermati se la modifica altera API pubblica, autenticazione, pagamenti, schema o dati del database, permessi o output usato esternamente.', 'Fermati se non puoi spiegare perché ogni utilizzatore manterrà lo stesso comportamento.', 'Fermati se la verifica fallisce; ripristina l’ultimo commit valido e analizza il primo errore.'] },
    ar: { inspect: concise ? 'افحص {location} وكل مستهلك قبل التعديل.' : 'اقرأ {location} ومستهلكيه والوحدات المتأثرة قبل التعديل. دوّن المدخلات والمخرجات والأخطاء والآثار الظاهرة.', change: concise ? '{action} نفّذ تغييراً محدداً في commit مستقل.' : '{action} نفّذ تغييراً صغيراً في commit مستقل؛ حافظ على العقد العام والسلوك ما لم توجد موافقة بشرية صريحة.', verify: 'شغّل `ycf verify` واختبر السلوك الذي يستخدم هذا الكود ثم شغّل `ycf release` قبل النشر.', stops: ['توقف إذا كان التغيير سيبدل API عامة أو المصادقة أو المدفوعات أو مخطط/بيانات قاعدة البيانات أو الصلاحيات أو مخرجاً يستخدمه طرف خارجي.', 'توقف إذا لم تستطع شرح سبب احتفاظ كل مستهلك بالسلوك نفسه.', 'توقف عند فشل التحقق؛ استعد آخر commit سليم وافحص أول فشل.'] },
    zh: { inspect: concise ? '编辑前检查 {location} 及每个调用方。' : '编辑前阅读 {location}、其调用方和受影响模块。记录可观察到的输入、输出、错误和副作用。', change: concise ? '{action} 在独立提交中完成一项聚焦变更。' : '{action} 在独立提交中完成一项小变更；除非获得明确人工批准，否则保持公共契约和行为不变。', verify: '运行 `ycf verify`，测试使用此代码的行为，然后在发布前运行 `ycf release`。', stops: ['如果变更会改变公共 API、身份验证、支付、数据库架构或数据、权限或外部使用的输出，请停止。', '如果你无法解释为何每个调用方会保持相同行为，请停止。', '如果验证失败，请恢复最后一个正常提交并先调查第一个失败项。'] }
  };
  return copy[language];
}

function guidedSteps(finding: AuditReport['findings'][number], suggestedAction: string, language: Language, audience: Audience): Pick<RefactorRecommendation, 'steps' | 'stopIf'> {
  const location = `${finding.file}:${finding.lines.join(',') || 'relevant location'}`;
  const copy = guidanceFor(language, audience);
  return {
    steps: [
      { phase: 'inspect', instruction: copy.inspect.replace('{location}', location) },
      { phase: 'change', instruction: copy.change.replace('{action}', suggestedAction) },
      { phase: 'verify', instruction: copy.verify }
    ],
    stopIf: copy.stops
  };
}

function recommendationFor(finding: AuditReport['findings'][number], affectedModules: string[], language: Language, audience: Audience): RefactorRecommendation | undefined {
  if (!refactorableRules.has(finding.ruleId) && finding.risk !== 'architectural') return undefined;
  const shared = (suggestedAction: string) => ({ id: `refactor:${finding.id}`, risk: finding.risk, file: finding.file, lines: finding.lines, affectedModules, requiresHumanReview: true, ...guidedSteps(finding, suggestedAction, language, audience) });
  switch (finding.ruleId) {
    case 'long-function': { const suggestedAction = 'Identify separate responsibilities, extract one small helper at a time, then run tests and build.'; return { ...shared(suggestedAction), title: 'Split an oversized function', why: finding.evidence, suggestedAction }; }
    case 'large-source-file': { const suggestedAction = 'Group related responsibilities first; move one cohesive group only after checking imports and consumers.'; return { ...shared(suggestedAction), title: 'Plan a module split', why: finding.evidence, suggestedAction }; }
    case 'large-react-component': { const suggestedAction = 'Extract a presentational component or custom hook with stable inputs, then verify UI behavior.'; return { ...shared(suggestedAction), title: 'Reduce a large React component', why: finding.evidence, suggestedAction }; }
    case 'high-complexity': { const suggestedAction = 'Name intermediate decisions or extract one branch; preserve tests for every behavior path.'; return { ...shared(suggestedAction), title: 'Simplify branching logic', why: finding.evidence, suggestedAction }; }
    case 'duplicate-code': { const suggestedAction = 'Compare all copies and their consumers. Extract shared code only if behavior, error handling and contracts match.'; return { ...shared(suggestedAction), title: 'Review duplicate code before consolidation', why: finding.evidence, suggestedAction }; }
    case 'similar-duplicate-code': { const suggestedAction = 'The structure matches but names or values differ. Compare inputs, errors and side effects; extract shared code only after tests prove equivalent behavior.'; return { ...shared(suggestedAction), title: 'Compare likely duplicate code before consolidation', why: finding.evidence, suggestedAction }; }
    case 'wordpress-rest-route-permission': { const suggestedAction = 'Add or verify a permission_callback with the appropriate capability. Do not change access behavior without product approval.'; return { ...shared(suggestedAction), title: 'Review WordPress REST authorization', why: finding.evidence, suggestedAction }; }
    case 'wordpress-dynamic-entrypoint': { const suggestedAction = 'Document the hook or callback path. Do not delete or rename it based on static analysis.'; return { ...shared(suggestedAction), title: 'Protect a dynamic WordPress entry point', why: finding.evidence, suggestedAction }; }
    default: return undefined;
  }
}

export function buildRefactorPlan(audit: AuditReport, understanding: UnderstandReport, language: Language = 'en', audience: Audience = 'guided'): RefactorPlan {
  const dependents = new Map<string, string[]>();
  for (const edge of understanding.graph.edges) dependents.set(edge.to, [...(dependents.get(edge.to) ?? []), edge.from]);
  const recommendations = audit.findings.flatMap((finding) => {
    const affectedModules = [...new Set([finding.file, ...(dependents.get(finding.file) ?? [])])];
    const recommendation = recommendationFor(finding, affectedModules, language, audience);
    return recommendation ? [recommendation] : [];
  });
  return {
    target: audit.target, language, audience,
    generatedAt: new Date().toISOString(),
    recommendations,
    summary: {
      safeRefactors: recommendations.filter((recommendation) => recommendation.risk === 'safe-refactor').length,
      architecturalReviews: recommendations.filter((recommendation) => recommendation.risk === 'architectural').length,
      total: recommendations.length
    }
  };
}
