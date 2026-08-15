import type { Language, ReleaseCheck } from './types.js';

type ReleaseCopy = {
  ready: string; reviewRequired: string; report: string; checked: string;
  names: Record<ReleaseCheck['name'], string>;
  passed: string; warning: string; failed: string;
};

const releaseCopy: Record<Language, ReleaseCopy> = {
  en: { ready: 'READY', reviewRequired: 'REVIEW REQUIRED', report: 'Report', checked: 'Checked', names: { git: 'Git status', audit: 'Code audit', architecture: 'Architecture', verification: 'Verification', documentation: 'Documentation' }, passed: 'passed', warning: 'review before publishing', failed: 'fix before publishing' },
  es: { ready: 'LISTO PARA PUBLICAR', reviewRequired: 'REVISIÓN NECESARIA', report: 'Informe', checked: 'Comprobado', names: { git: 'Estado de Git', audit: 'Auditoría de código', architecture: 'Arquitectura', verification: 'Verificación', documentation: 'Documentación' }, passed: 'correcto', warning: 'revísalo antes de publicar', failed: 'corrígelo antes de publicar' },
  pt: { ready: 'PRONTO PARA PUBLICAR', reviewRequired: 'REVISÃO NECESSÁRIA', report: 'Relatório', checked: 'Verificado', names: { git: 'Estado do Git', audit: 'Auditoria de código', architecture: 'Arquitetura', verification: 'Verificação', documentation: 'Documentação' }, passed: 'aprovado', warning: 'revise antes de publicar', failed: 'corrija antes de publicar' },
  fr: { ready: 'PRÊT À PUBLIER', reviewRequired: 'RÉVISION NÉCESSAIRE', report: 'Rapport', checked: 'Vérifié', names: { git: 'État Git', audit: 'Audit du code', architecture: 'Architecture', verification: 'Vérification', documentation: 'Documentation' }, passed: 'validé', warning: 'à vérifier avant publication', failed: 'à corriger avant publication' },
  de: { ready: 'BEREIT ZUR VERÖFFENTLICHUNG', reviewRequired: 'PRÜFUNG ERFORDERLICH', report: 'Bericht', checked: 'Geprüft', names: { git: 'Git-Status', audit: 'Code-Audit', architecture: 'Architektur', verification: 'Prüfung', documentation: 'Dokumentation' }, passed: 'bestanden', warning: 'vor Veröffentlichung prüfen', failed: 'vor Veröffentlichung beheben' },
  it: { ready: 'PRONTO PER LA PUBBLICAZIONE', reviewRequired: 'REVISIONE NECESSARIA', report: 'Rapporto', checked: 'Controllato', names: { git: 'Stato Git', audit: 'Audit del codice', architecture: 'Architettura', verification: 'Verifica', documentation: 'Documentazione' }, passed: 'superato', warning: 'verifica prima della pubblicazione', failed: 'correggi prima della pubblicazione' },
  ar: { ready: 'جاهز للنشر', reviewRequired: 'المراجعة مطلوبة', report: 'التقرير', checked: 'تم التحقق', names: { git: 'حالة Git', audit: 'تدقيق الكود', architecture: 'البنية', verification: 'التحقق', documentation: 'التوثيق' }, passed: 'تم بنجاح', warning: 'راجعه قبل النشر', failed: 'أصلحه قبل النشر' },
  zh: { ready: '可以发布', reviewRequired: '需要检查', report: '报告', checked: '检查时间', names: { git: 'Git 状态', audit: '代码审计', architecture: '架构', verification: '验证', documentation: '文档' }, passed: '已通过', warning: '发布前请检查', failed: '发布前请修复' }
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
  return `${copy.names[check.name]} — ${message}`;
}
