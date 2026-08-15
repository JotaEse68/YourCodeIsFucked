import type { Language, ReleaseCheck } from './types.js';

type ReleaseCopy = {
  ready: string; reviewRequired: string; report: string; checked: string;
  names: Record<ReleaseCheck['name'], string>;
  passed: string; warning: string; failed: string; next: Record<ReleaseCheck['status'], string>;
};

const releaseCopy: Record<Language, ReleaseCopy> = {
  en: { ready: 'READY', reviewRequired: 'REVIEW REQUIRED', report: 'Report', checked: 'Checked', names: { git: 'Git status', audit: 'Code audit', architecture: 'Architecture', verification: 'Verification', documentation: 'Documentation', dependencies: 'Dependencies' }, passed: 'passed', warning: 'review before publishing', failed: 'fix before publishing', next: { passed: 'No action is needed.', warning: 'This does not block publishing, but review it before you release.', failed: 'This blocks publishing. Resolve it before releasing.' } },
  es: { ready: 'LISTO PARA PUBLICAR', reviewRequired: 'REVISIÓN NECESARIA', report: 'Informe', checked: 'Comprobado', names: { git: 'Estado de Git', audit: 'Auditoría de código', architecture: 'Arquitectura', verification: 'Verificación', documentation: 'Documentación', dependencies: 'Dependencias' }, passed: 'correcto', warning: 'revísalo antes de publicar', failed: 'corrígelo antes de publicar', next: { passed: 'No necesitas hacer nada.', warning: 'No bloquea la publicación, pero revísalo antes de continuar.', failed: 'Bloquea la publicación. Resuélvelo antes de continuar.' } },
  pt: { ready: 'PRONTO PARA PUBLICAR', reviewRequired: 'REVISÃO NECESSÁRIA', report: 'Relatório', checked: 'Verificado', names: { git: 'Estado do Git', audit: 'Auditoria de código', architecture: 'Arquitetura', verification: 'Verificação', documentation: 'Documentação', dependencies: 'Dependências' }, passed: 'aprovado', warning: 'revise antes de publicar', failed: 'corrija antes de publicar', next: { passed: 'Nenhuma ação é necessária.', warning: 'Isto não bloqueia a publicação, mas revise antes de continuar.', failed: 'Isto bloqueia a publicação. Resolva antes de continuar.' } },
  fr: { ready: 'PRÊT À PUBLIER', reviewRequired: 'RÉVISION NÉCESSAIRE', report: 'Rapport', checked: 'Vérifié', names: { git: 'État Git', audit: 'Audit du code', architecture: 'Architecture', verification: 'Vérification', documentation: 'Documentation', dependencies: 'Dépendances' }, passed: 'validé', warning: 'à vérifier avant publication', failed: 'à corriger avant publication', next: { passed: 'Aucune action n’est nécessaire.', warning: 'Cela ne bloque pas la publication, mais vérifiez avant de continuer.', failed: 'Cela bloque la publication. Corrigez-le avant de continuer.' } },
  de: { ready: 'BEREIT ZUR VERÖFFENTLICHUNG', reviewRequired: 'PRÜFUNG ERFORDERLICH', report: 'Bericht', checked: 'Geprüft', names: { git: 'Git-Status', audit: 'Code-Audit', architecture: 'Architektur', verification: 'Prüfung', documentation: 'Dokumentation', dependencies: 'Abhängigkeiten' }, passed: 'bestanden', warning: 'vor Veröffentlichung prüfen', failed: 'vor Veröffentlichung beheben', next: { passed: 'Keine Aktion erforderlich.', warning: 'Dies blockiert die Veröffentlichung nicht, sollte aber vorher geprüft werden.', failed: 'Dies blockiert die Veröffentlichung. Behebe es vorher.' } },
  it: { ready: 'PRONTO PER LA PUBBLICAZIONE', reviewRequired: 'REVISIONE NECESSARIA', report: 'Rapporto', checked: 'Controllato', names: { git: 'Stato Git', audit: 'Audit del codice', architecture: 'Architettura', verification: 'Verifica', documentation: 'Documentazione', dependencies: 'Dipendenze' }, passed: 'superato', warning: 'verifica prima della pubblicazione', failed: 'correggi prima della pubblicazione', next: { passed: 'Non è necessaria alcuna azione.', warning: 'Non blocca la pubblicazione, ma verifica prima di continuare.', failed: 'Blocca la pubblicazione. Correggi prima di continuare.' } },
  ar: { ready: 'جاهز للنشر', reviewRequired: 'المراجعة مطلوبة', report: 'التقرير', checked: 'تم التحقق', names: { git: 'حالة Git', audit: 'تدقيق الكود', architecture: 'البنية', verification: 'التحقق', documentation: 'التوثيق', dependencies: 'التبعيات' }, passed: 'تم بنجاح', warning: 'راجعه قبل النشر', failed: 'أصلحه قبل النشر', next: { passed: 'لا يلزم اتخاذ إجراء.', warning: 'لا يمنع النشر، لكن راجعه قبل المتابعة.', failed: 'هذا يمنع النشر. أصلحه قبل المتابعة.' } },
  zh: { ready: '可以发布', reviewRequired: '需要检查', report: '报告', checked: '检查时间', names: { git: 'Git 状态', audit: '代码审计', architecture: '架构', verification: '验证', documentation: '文档', dependencies: '依赖项' }, passed: '已通过', warning: '发布前请检查', failed: '发布前请修复', next: { passed: '无需采取任何操作。', warning: '这不会阻止发布，但请在继续前检查。', failed: '这会阻止发布。请在继续前解决。' } }
};

type NextSteps = Partial<Record<ReleaseCheck['name'], Partial<Record<ReleaseCheck['status'], string>>>>;

const actionableNextStep: Record<Language, NextSteps> = {
  en: {
    git: { failed: 'There are changes outside a commit. Review them and create a commit before publishing.', warning: 'Git is unavailable. Create or review the repository so changes can be recovered if something goes wrong.' },
    audit: { failed: 'Medium-risk findings need review. Run `ycf audit`, understand each item, then fix or consciously accept it before publishing.', warning: 'Low-risk findings remain. Read them and decide whether they can safely wait.' },
    architecture: { warning: 'Some modules import each other. Review the map to avoid unexpected changes when publishing.' },
    verification: { failed: 'A declared check failed. Run `ycf verify` and fix the first failure before publishing.', warning: 'No checks are configured. Add tests or a build check, or validate the project manually.' },
    documentation: { warning: 'README.md was not found. Add basic installation, usage, and risk instructions before publishing.' },
    dependencies: { failed: 'Dependency security information is unavailable or a high-risk issue was found. Restore the check or update/review the affected package before publishing.', warning: 'Low or moderate dependency issues remain. Review the affected package and its available fix before publishing.' }
  },
  es: {
    git: { failed: 'Hay cambios sin guardar en un commit. Revísalos y crea un commit antes de publicar.', warning: 'Git no está disponible. Crea o revisa el repositorio para poder recuperar cambios si algo sale mal.' },
    audit: { failed: 'Hay riesgos medios detectados. Abre `ycf audit --language es`, entiende cada aviso y corrígelo o justifícalo antes de publicar.', warning: 'Quedan avisos de bajo riesgo. Léelos y decide conscientemente si pueden esperar.' },
    architecture: { warning: 'Hay módulos que se importan entre sí. Revisa el mapa para evitar cambios inesperados al publicar.' },
    verification: { failed: 'Alguna comprobación declarada falló. Ejecuta `ycf verify` y corrige el primer fallo antes de publicar.', warning: 'No hay comprobaciones configuradas. Añade al menos pruebas o compilación, o valida el proyecto manualmente.' },
    documentation: { warning: 'No se encontró README.md. Añade instrucciones básicas de instalación, uso y riesgos antes de publicar.' },
    dependencies: { failed: 'No se pudo consultar la seguridad de dependencias o se detectó un riesgo alto. Recupera la comprobación o actualiza/revisa el paquete afectado antes de publicar.', warning: 'Quedan riesgos bajos o moderados en dependencias. Revisa el paquete afectado y la actualización disponible antes de publicar.' }
  },
  pt: {
    git: { failed: 'Há alterações fora de um commit. Revise-as e crie um commit antes de publicar.', warning: 'O Git não está disponível. Crie ou reveja o repositório para poder recuperar alterações se algo falhar.' },
    audit: { failed: 'Há achados de risco médio. Execute `ycf audit`, entenda cada item e corrija-o ou aceite-o conscientemente antes de publicar.', warning: 'Ainda há avisos de baixo risco. Leia-os e decida se podem esperar.' },
    architecture: { warning: 'Alguns módulos importam uns aos outros. Reveja o mapa para evitar alterações inesperadas ao publicar.' },
    verification: { failed: 'Uma verificação declarada falhou. Execute `ycf verify` e corrija a primeira falha antes de publicar.', warning: 'Não há verificações configuradas. Adicione testes ou compilação, ou valide o projeto manualmente.' },
    documentation: { warning: 'README.md não foi encontrado. Adicione instruções básicas de instalação, uso e riscos antes de publicar.' }
  },
  fr: {
    git: { failed: 'Des modifications ne sont pas dans un commit. Vérifiez-les et créez un commit avant de publier.', warning: 'Git est indisponible. Créez ou vérifiez le dépôt pour pouvoir récupérer les changements en cas de problème.' },
    audit: { failed: 'Des éléments à risque moyen doivent être examinés. Lancez `ycf audit`, comprenez chaque élément, puis corrigez-le ou acceptez-le consciemment.', warning: 'Des avertissements à faible risque subsistent. Lisez-les et décidez s’ils peuvent attendre.' },
    architecture: { warning: 'Certains modules s’importent mutuellement. Vérifiez la carte pour éviter des changements inattendus.' },
    verification: { failed: 'Une vérification déclarée a échoué. Lancez `ycf verify` et corrigez le premier échec avant de publier.', warning: 'Aucune vérification n’est configurée. Ajoutez des tests ou une compilation, ou validez le projet manuellement.' },
    documentation: { warning: 'README.md est absent. Ajoutez les instructions d’installation, d’utilisation et de risques avant de publier.' }
  },
  de: {
    git: { failed: 'Es gibt Änderungen außerhalb eines Commits. Prüfe sie und erstelle vor der Veröffentlichung einen Commit.', warning: 'Git ist nicht verfügbar. Erstelle oder prüfe das Repository, damit Änderungen bei Problemen wiederherstellbar sind.' },
    audit: { failed: 'Es gibt Befunde mit mittlerem Risiko. Führe `ycf audit` aus, verstehe jeden Punkt und behebe oder akzeptiere ihn bewusst.', warning: 'Es bleiben Hinweise mit niedrigem Risiko. Lies sie und entscheide, ob sie warten können.' },
    architecture: { warning: 'Einige Module importieren einander. Prüfe die Karte, um unerwartete Änderungen zu vermeiden.' },
    verification: { failed: 'Eine deklarierte Prüfung ist fehlgeschlagen. Führe `ycf verify` aus und behebe den ersten Fehler.', warning: 'Keine Prüfungen sind konfiguriert. Füge Tests oder einen Build hinzu oder prüfe das Projekt manuell.' },
    documentation: { warning: 'README.md wurde nicht gefunden. Ergänze vor der Veröffentlichung Installations-, Nutzungs- und Risikohinweise.' }
  },
  it: {
    git: { failed: 'Ci sono modifiche fuori da un commit. Esaminale e crea un commit prima di pubblicare.', warning: 'Git non è disponibile. Crea o controlla il repository per poter recuperare le modifiche in caso di problemi.' },
    audit: { failed: 'Ci sono risultati a rischio medio. Esegui `ycf audit`, comprendi ogni voce e correggila o accettala consapevolmente.', warning: 'Restano avvisi a basso rischio. Leggili e decidi se possono attendere.' },
    architecture: { warning: 'Alcuni moduli si importano a vicenda. Controlla la mappa per evitare cambiamenti imprevisti.' },
    verification: { failed: 'Una verifica dichiarata non è riuscita. Esegui `ycf verify` e correggi il primo errore.', warning: 'Non sono configurate verifiche. Aggiungi test o compilazione, oppure valida manualmente il progetto.' },
    documentation: { warning: 'README.md non è stato trovato. Aggiungi istruzioni di installazione, uso e rischi prima di pubblicare.' }
  },
  ar: {
    git: { failed: 'هناك تغييرات خارج commit. راجعها وأنشئ commit قبل النشر.', warning: 'Git غير متاح. أنشئ المستودع أو راجعه حتى يمكن استعادة التغييرات عند حدوث مشكلة.' },
    audit: { failed: 'توجد نتائج ذات مخاطر متوسطة. شغّل `ycf audit`، وافهم كل نقطة ثم أصلحها أو اقبلها بوعي قبل النشر.', warning: 'ما زالت تحذيرات منخفضة المخاطر موجودة. اقرأها وقرر إن كان يمكن تأجيلها.' },
    architecture: { warning: 'تستورد بعض الوحدات بعضها بعضاً. راجع الخريطة لتجنب تغييرات غير متوقعة عند النشر.' },
    verification: { failed: 'فشل تحقق مُعلن. شغّل `ycf verify` وأصلح أول فشل قبل النشر.', warning: 'لا توجد عمليات تحقق مهيأة. أضف اختبارات أو عملية بناء، أو تحقق من المشروع يدوياً.' },
    documentation: { warning: 'لم يتم العثور على README.md. أضف تعليمات التثبيت والاستخدام والمخاطر قبل النشر.' }
  },
  zh: {
    git: { failed: '有些更改尚未提交。请检查它们，并在发布前创建 commit。', warning: '无法使用 Git。请创建或检查仓库，以便在出现问题时能够恢复更改。' },
    audit: { failed: '存在中等风险项。运行 `ycf audit`，理解每一项后，在发布前修复或有意识地接受它。', warning: '仍有低风险提示。请阅读并决定它们是否可以等待。' },
    architecture: { warning: '部分模块相互导入。请检查架构图，以避免发布时出现意外更改。' },
    verification: { failed: '一个已声明的检查失败。运行 `ycf verify`，并在发布前修复第一个失败项。', warning: '未配置检查。请添加测试或构建检查，或手动验证项目。' },
    documentation: { warning: '未找到 README.md。请在发布前添加基本的安装、使用和风险说明。' }
  }
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
  const next = actionableNextStep[language][check.name]?.[check.status] ?? copy.next[check.status];
  return `${copy.names[check.name]} — ${message}. ${next}`;
}
