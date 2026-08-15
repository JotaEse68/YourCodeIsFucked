# YCF — YourCodeIsFucked

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · **العربية** · [中文](README.zh.md)

YCF أداة مفتوحة المصدر تعمل من سطر الأوامر لفهم مشاريع البرمجيات وفحصها وتحسينها بأمان. تبحث عن مشكلات قابلة للقياس وتشرح الخطوة التالية.

## ابدأ من هنا

```bash
npm install -g your-code-is-fucked
cd my-project
ycf init
ycf audit
ycf unfuck --dry-run
```

في `ycf init` اختر اللغة ومستوى الشرح. للحصول على شرح واضح، اختر `العربية` و`guided`.

## فهم النتيجة

- **AUTO**: يستطيع YCF تطبيق التغيير مع نقطة استعادة والتحقق.
- **SAFE REFACTOR**: يوجد تحسين محتمل؛ راجع الهدف قبل التعديل.
- **REPORT-ONLY**: يشرح YCF المشكلة من دون تغيير شيء.
- **ARCHITECTURAL**: يمس منطقة حساسة ويتطلب قراراً بشرياً.

استخدم `ycf cleanup --dry-run` لرؤية التغييرات الآمنة. استخدم `ycf cleanup --yes` فقط بعد مراجعة الخطة؛ ينشئ YCF نقطة استعادة Git ويعيد المشروع إذا فشل التحقق.

## الحماية والحالة

لا يغير YCF تلقائياً المصادقة أو المدفوعات أو واجهات API العامة أو مخططات قواعد البيانات أو التكاملات الخارجية أو الاستدعاءات الديناميكية. الإصدار الحالي يدعم JS/TS/React والتنظيف الآمن؛ دعم PHP/WordPress قيد التطوير.
