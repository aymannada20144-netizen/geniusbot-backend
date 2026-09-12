import { isApiError } from './apiError'

export function campaignErrorMessage(error: unknown, language: 'ar' | 'en'): string {
  const ar = language === 'ar'
  if (isApiError(error)) {
    switch (error.status) {
      case 404:
        return error.kind === 'backend'
          ? (ar ? 'الحملة غير موجودة في هذه العيادة. حدّث قائمة الحملات.' : 'Campaign not found in this clinic. Refresh the campaign list.')
          : (ar ? 'خدمة الحملات غير متاحة على الخادم الحالي. يرجى التواصل مع المسؤول لتحديث الخادم.' : 'The campaign endpoint is unavailable on the current server. Ask your administrator to update the server.')
      case 409:
        return ar ? 'تغيّرت حالة الحملة. يمكن تعديل أو إلغاء المسودات والحملات المجدولة فقط. حدّث القائمة.' : 'The campaign state has changed. Only drafts and scheduled campaigns can be edited or cancelled. Refresh the list.'
      case 400:
      case 422:
        return ar ? 'تحقق من اسم الحملة والقالب وحقول العرض والفرع وموعد مستقبلي، ومن وجود مستلمين وافقوا على التسويق.' : error.message
      case 401:
      case 403:
        return ar ? 'ليس لديك صلاحية لتنفيذ هذا الإجراء. تحقق من تسجيل الدخول وصلاحيات العيادة.' : 'You are not authorized for this action. Check your login and clinic permissions.'
    }
  }
  return ar ? 'تعذّر إكمال طلب الحملة. تحقق من الاتصال وحاول مجدداً.' : 'Unable to complete the campaign request. Check your connection and try again.'
}
