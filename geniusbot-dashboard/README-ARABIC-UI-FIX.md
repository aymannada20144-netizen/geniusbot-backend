# Shaden Dashboard — Arabic UI & Action Polish

تم تطبيق التعديلات مباشرة على مجلد `geniusbot-dashboard`:

- إصلاح خلط العربية والإنجليزية في الواجهة العربية، مع معالجة قيم الجداول مثل Yes/No وأدوار المستخدم.
- إعادة ترتيب صفحة تسجيل الدخول: بطاقة الدخول في اليمين في العربية، والهوية/التعريف في اليسار، مع نص عربي كامل.
- تحسين أزرار الإجراءات دلاليًا:
  - عرض/تعديل: أزرق/سماوي.
  - تحديث: أخضر/فيروزي.
  - تفعيل/تعطيل: ذهبي/كهرماني.
  - حذف: أحمر واضح مع Hover أقوى.
- تحسين Focus لحقل البحث والفلاتر.
- الحفاظ على وظائف API وRoutes ومنطق النظام بدون تغيير.

## Validation
- TypeScript: PASS (`tsc -b`)
- ESLint: PASS
- Vite bundling داخل بيئة Linux الحالية يتوقف فقط بسبب أن `node_modules` المرفوع يحتوي Rolldown Windows native binding؛ على Windows استخدم `npm install` ثم `npm run dev` أو `npm run build`.
