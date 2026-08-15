import type { Language, ReleaseCheck } from './types.js';

type ReleaseCopy = {
  ready: string; reviewRequired: string; report: string; checked: string;
  names: Record<ReleaseCheck['name'], string>;
  passed: string; warning: string; failed: string; next: Record<ReleaseCheck['status'], string>;
};

const releaseCopy: Record<Language, ReleaseCopy> = {
  en: { ready: 'READY', reviewRequired: 'REVIEW REQUIRED', report: 'Report', checked: 'Checked', names: { git: 'Git status', audit: 'Code audit', architecture: 'Architecture', verification: 'Verification', documentation: 'Documentation' }, passed: 'passed', warning: 'review before publishing', failed: 'fix before publishing', next: { passed: 'No action is needed.', warning: 'This does not block publishing, but review it before you release.', failed: 'This blocks publishing. Resolve it before releasing.' } },
  es: { ready: 'LISTO PARA PUBLICAR', reviewRequired: 'REVISIÓN NECESARIA', report: 'Informe', checked: 'Comprobado', names: { git: 'Estado de Git', audit: 'Auditoría de código', architecture: 'Arquitectura', verification: 'Verificación', documentation: 'Documentación' }, passed: 'correcto', warning: 'revísalo antes de publicar', failed: 'corrígelo antes de publicar', next: { passed: 'No necesitas hacer nada.', warning: 'No bloquea la publicación, pero revísalo antes de continuar.', failed: 'Bloquea la publicación. Resuélvelo antes de continuar.' } },
  pt: { ready: 'PRONTO PARA PUBLICAR', reviewRequired: 'REVISÃO NECESSÁRIA', report: 'Relatório', checked: 'Verificado', names: { git: 'Estado do Git', audit: 'Auditoria de código', architecture: 'Arquitetura', verification: 'Verificação', documentation: 'Documentação' }, passed: 'aprovado', warning: 'revise antes de publicar', failed: 'corrija antes de publicar', next: { passed: 'Nenhuma ação é necessária.', warning: 'Isto não bloqueia a publicação, mas revise antes de continuar.', failed: 'Isto bloqueia a publicação. Resolva antes de continuar.' } },
  fr: { ready: 'PRÊT À PUBLIER', reviewRequired: 'RÉVISION NÉCESSAIRE', report: 'Rapport', checked: 'Vérifié', names: { git: 'État Git', audit: 'Audit du code', architecture: 'Architecture', verification: 'Vérification', documentation: 'Documentation' }, passed: 'validé', warning: 'à vérifier avant publication', failed: 'à corriger avant publication', next: { passed: 'Aucune action n’est nécessaire.', warning: 'Cela ne bloque pas la publication, mais vérifiez avant de continuer.', failed: 'Cela bloque la publication. Corrigez-le avant de continuer.' } },
  de: { ready: 'BEREIT ZUR VERÖFFENTLICHUNG', reviewRequired: 'PRÜFUNG ERFORDERLICH', report: 'Bericht', checked: 'Geprüft', names: { git: 'Git-Status', audit: 'Code-Audit', architecture: 'Architektur', verification: 'Prüfung', documentation: 'Dokumentation' }, passed: 'bestanden', warning: 'vor Veröffentlichung prüfen', failed: 'vor Veröffentlichung beheben', next: { passed: 'Keine Aktion erforderlich.', warning: 'Dies blockiert die Veröffentlichung nicht, sollte aber vorher geprüft werden.', failed: 'Dies blockiert die Veröffentlichung. Behebe es vorher.' } },
  it: { ready: 'PRONTO PER LA PUBBLICAZIONE', reviewRequired: 'REVISIONE NECESSARIA', report: 'Rapporto', checked: 'Controllato', names: { git: 'Stato Git', audit: 'Audit del codice', architecture: 'Architettura', verification: 'Verifica', documentation: 'Documentazione' }, passed: 'superato', warning: 'verifica prima della pubblicazione', failed: 'correggi prima della pubblicazione', next: { passed: 'Non è necessaria alcuna azione.', warning: 'Non blocca la pubblicazione, ma verifica prima di continuare.', failed: 'Blocca la pubblicazione. Correggi prima di continuare.' } },
  ar: { ready: 'جاهز للنشر', reviewRequired: 'المراجعة مطلوبة', report: 'التقرير', checked: 'تم التحقق', names: { git: 'حالة Git', audit: 'تدقيق الكود', architecture: 'البنية', verification: 'التحقق', documentation: 'التوثيق' }, passed: 'تم بنجاح', warning: 'راجعه قبل النشر', failed: 'أصلحه قبل النشر', next: { passed: 'لا يلزم اتخاذ إجراء.', warning: 'لا يمنع النشر، لكن راجعه قبل المتابعة.', failed: 'هذا يمنع النشر. أصلحه قبل المتابعة.' } },
  zh: { ready: '可以发布', reviewRequired: '需要检查', report: '报告', checked: '检查时间', names: { git: 'Git 状态', audit: '代码审计', architecture: '架构', verification: '验证', documentation: '文档' }, passed: '已通过', warning: '发布前请检查', failed: '发布前请修复', next: { passed: '无需采取任何操作。', warning: '这不会阻止发布，但请在继续前检查。', failed: '这会阻止发布。请在继续前解决。' } }
};

const spanishNextStep: Partial<Record<ReleaseCheck['name'], Partial<Record<ReleaseCheck['status'], string>>>> = {
  git: { failed: 'Hay cambios sin guardar en un commit. Revísalos y crea un commit antes de publicar.', warning: 'Git no está disponible. Crea o revisa el repositorio para poder recuperar cambios si algo sale mal.' },
  audit: { failed: 'Hay riesgos medios detectados. Abre `ycf audit --language es`, entiende cada aviso y corrígelo o justifícalo antes de publicar.', warning: 'Quedan avisos de bajo riesgo. Léelos y decide conscientemente si pueden esperar.' },
  architecture: { warning: 'Hay módulos que se importan entre sí. Revisa el mapa para evitar cambios inesperados al publicar.' },
  verification: { failed: 'Alguna comprobación declarada falló. Ejecuta `ycf verify` y corrige el primer fallo antes de publicar.', warning: 'No hay comprobaciones configuradas. Añade al menos pruebas o compilación, o valida el proyecto manualmente.' },
  documentation: { warning: 'No se encontró README.md. Añade instrucciones básicas de instalación, uso y riesgos antes de publicar.' }
};

export function releaseHeading(language: Language, ready: boolean): string {
  const copy = releaseCopy[language];
  return ready ? copy.ready : copy.reviewRequired;
}

export function releaseReportLabel(language: Language): string { return releaseCopy[language].report; }

export function releaseCheckedLabel(language: Language): string { return releaseCopy[language].checked; }

export function releaseCheckLabel(language: Language, check: ReleaseCheck): string {
  const copy = releaseCopy[language];
  const message = check.status === 'passed' ? copy.passed : check.status === 'failed' ? copy.failed : copy.warning;
  const next = language === 'es' ? spanishNextStep[check.name]?.[check.status] ?? copy.next[check.status] : copy.next[check.status];
  return `${copy.names[check.name]} — ${message}. ${next}`;
}
