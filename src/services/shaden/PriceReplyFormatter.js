'use strict';

// Presentation only; scope and available choices belong to the decision.
class PriceReplyFormatter {
  constructor(policy) { this.policy = policy; }
  format(d, catalog) {
    const s = d.nextPriceState;
    const o = d.options || {};
    if (d.sideInquiry?.type === 'branches') return this.policy.branches(catalog.branches, catalog.clinic);
    if (d.sideInquiry?.type === 'working_hours') return this.policy.allWorkingHours(catalog);
    if (d.sideInquiry?.type === 'services') return this.policy.services(catalog.services, catalog.clinic);
    if (d.dismissed) return 'تمام 🌸 أنا معك إذا احتجتِ أي خدمة أخرى.';
    switch (d.action) {
      case 'ASK_SERVICE': return `${d.unknownService ? 'لم أتعرف على الخدمة.\n' : ''}${this.policy.services(o.services || catalog.services, catalog.clinic)}\nاختاري خدمة واحدة لمعرفة سعرها.`;
      case 'ASK_PAYMENT_METHOD': return s.selected_service_id ? 'هل الدفع كاش أم تأمين؟' : `${d.unknownService ? 'لم أتعرف على الخدمة.\n' : ''}${this.policy.services(o.services || catalog.services, catalog.clinic)}\nاختاري خدمة واحدة لمعرفة سعرها.`;
      case 'ASK_INSURANCE_COMPANY': return this.policy.insuranceCompanies(o.companies, true);
      case 'ASK_INSURANCE_CLASS': return this.policy.insuranceClasses(o.classes, true);
      case 'INVALID_INSURANCE_COMPANY': return `لا يوجد سعر مسجل لهذه الشركة.\n${this.policy.insuranceCompanies(o.companies, true)}`;
      case 'INVALID_INSURANCE_CLASS': return `لا يوجد سعر مسجل لهذه الفئة.\n${this.policy.insuranceClasses(o.classes, true)}`;
      case 'PRICE_NOT_FOUND': return s.selected_payment_method === 'insurance' ? 'لا يوجد سعر تأمين مسجل لهذه الخدمة على الشركة والفئة المحددتين حاليًا 🌸' : 'لا يوجد سعر مسجل لهذه الخيارات حاليًا 🌸';
      case 'QUOTE_CASH_PRICE':
      case 'QUOTE_INSURANCE_PRICE': {
        const insurance = d.action === 'QUOTE_INSURANCE_PRICE';
        const scope = insurance ? `على ${s.selected_insurance_company_name} فئة ${s.selected_insurance_class_name} هو` : 'كاش';
        const amount = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 2 }).format(s.amount);
        return `سعر ${s.selected_service_name} ${scope} ${amount} ${s.currency === 'SAR' ? 'ريال' : s.currency} 🌸\nهل ترغبين في حجز موعد؟`;
      }
      case 'OFFER_BOOKING': return 'هل ترغبين في حجز موعد؟ 🌸';
      case 'HANDOFF_TO_BOOKING': return '';
      default: throw new TypeError('Unknown price action.');
    }
  }
}
module.exports = PriceReplyFormatter;
