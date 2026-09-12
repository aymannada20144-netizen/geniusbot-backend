# Shaden Premium Dashboard Redesign

تم تطبيق التصميم الجديد مباشرة على مشروع `geniusbot-dashboard` الموجود داخل مشروع GeniusBot Backend المرفوع.

## ما تم تغييره
- تحويل الواجهة بالكامل إلى Dark Navy premium UI بهوية GeniusBot / Shaden.
- Cyan / Blue gradients مع Violet accent محدود.
- إعادة تصميم Sidebar وHeader والـnavigation states.
- استخدام شعار GeniusBot الحقيقي في أعلى الـSidebar وصفحة Login.
- إضافة favicon وأيقونات PWA من شعار GeniusBot ليظهر الشعار في تبويب/Address Bar المتصفح.
- إعادة تصميم Dashboard Home مع hero وKPIs وQuick Links وClinic Readiness.
- توحيد Cards / Tables / Forms / Filters / Buttons / Status Badges / Modals عبر كل الصفحات الحالية.
- إعادة تصميم Login Page بنفس الهوية الجديدة.
- دعم RTL/LTR والـresponsive الموجود بالمشروع.
- لم يتم تغيير API أو business logic أو routes أو permissions.

## ملفات الهوية الجديدة الرئيسية
- `src/styles/premium-theme.css`
- `src/styles/tokens.css`
- `src/styles/global.css`
- `src/components/layout/AppSidebar.tsx`
- `src/pages/dashboard/DashboardHomePage.tsx`
- `src/pages/LoginPage.tsx`
- `index.html`
- `public/geniusbot-logo.png`
- `public/favicon.ico` وملفات الأيقونات الأخرى

## التحقق
تم بنجاح:
- `tsc -b`
- `eslint .`

تعذر تشغيل مرحلة Vite bundling في بيئة Linux الحالية لأن `node_modules` المرفوع من Windows يحتوي native Rolldown binding الخاص بـ Windows فقط. هذا ليس خطأ TypeScript أو خطأ في التصميم. على جهاز المشروع Windows استخدم النسخة الحالية من `node_modules` أو نفذ `npm install` ثم:

```bash
npm run dev
```

وللبناء:

```bash
npm run build
```

## ملاحظة الأمان
لم يتم تضمين `.env` في نسخة التسليم الجديدة.
