'use strict';
const QUOTE_ACTIONS = new Set(['QUOTE_CASH_PRICE', 'QUOTE_INSURANCE_PRICE']);
class PriceDecisionExecutor {
  constructor({ priceService, policy, clock = { now: () => new Date() } }) { this.priceService = priceService; this.policy = policy; this.clock = clock; }
  async execute(decision, catalog) {
    if (!decision?.action) throw new TypeError('Price decision action is required.');
    if (decision.dismissed) return { reply: 'تمام 🌸 أنا معك إذا احتجتِ أي خدمة أخرى.', nextPriceState: null };
    if (decision.action === 'QUOTE_CASH_PRICE' && decision.evidence !== 'CURRENT') throw new Error('Cash quote requires CURRENT explicit evidence.');
    const state = { ...decision.nextPriceState };
    if (QUOTE_ACTIONS.has(decision.action)) return this.quote(decision, state, catalog);
    if (decision.action === 'ASK_INSURANCE_COMPANY') return { reply: this.policy.insuranceCompanies(decision.options.companies, true), nextPriceState: state };
    if (decision.action === 'ASK_INSURANCE_CLASS') return { reply: this.policy.insuranceClasses(decision.options.classes, true), nextPriceState: state };
    if (decision.action === 'INVALID_INSURANCE_COMPANY') return { reply: `لا يوجد سعر مسجل لهذه الشركة.\n${this.policy.insuranceCompanies(decision.options.companies, true)}`, nextPriceState: state };
    if (decision.action === 'INVALID_INSURANCE_CLASS') return { reply: `لا يوجد سعر مسجل لهذه الفئة.\n${this.policy.insuranceClasses(decision.options.classes, true)}`, nextPriceState: state };
    return { reply: this.prompt(decision, state, catalog), nextPriceState: state, handoff: decision.action === 'HANDOFF_TO_BOOKING' };
  }
  async quote(decision, state, catalog) { const cash = decision.action === 'QUOTE_CASH_PRICE'; const method = (catalog.paymentMethods || []).find((x) => String(x.code).toLowerCase() === (cash ? 'cash' : 'insurance'));
    if (!method || !this.priceService) return { reply: 'لا يوجد سعر مسجل لهذه الخيارات حاليًا 🌸', nextPriceState: state, action: 'PRICE_NOT_FOUND' };
    try { const price = await this.priceService.resolvePrice({ clinicId: catalog.clinic.id, serviceId: state.selected_service_id, paymentMethodId: method.id, insuranceCompanyId: cash ? null : state.selected_insurance_company_id, insuranceClassId: cash ? null : state.selected_insurance_class_id, bookingDate: this.clock.now() });
      const value = price.price; const display = displayAmount(value); state.currency = price.currency || 'SAR'; if (cash) state.resolved_cash_price = String(value); else state.resolved_insurance_price = String(value);
      return { reply: cash ? `سعر ${state.selected_service_name} كاش ${display} ريال 🌸\nهل ترغبين في حجز موعد؟` : `سعر ${state.selected_service_name} على ${state.selected_insurance_company_name} فئة ${state.selected_insurance_class_name} هو ${display} ريال 🌸\nهل ترغبين في حجز موعد؟`, nextPriceState: state };
    } catch { return { reply: 'لا يوجد سعر مسجل لهذه الخيارات حاليًا 🌸', nextPriceState: state, action: 'PRICE_NOT_FOUND' }; }
  }
  prompt(d, s, c) { const names = (items) => (items || []).map((x) => `▪️ ${x.name}`).join('\n') || 'لا توجد خيارات متاحة حاليًا.'; switch (d.action) { case 'ASK_PAYMENT_METHOD': return s.selected_service_id ? 'هل الدفع كاش أم تأمين؟' : `${this.policy.services(c.services || [], c.clinic)}\nاختاري خدمة واحدة لمعرفة سعرها.`; case 'ASK_INSURANCE_COMPANY': return `اختاري شركة التأمين:\n${names(c.insuranceCompanies)}`; case 'ASK_INSURANCE_CLASS': return `اختاري فئة التأمين:\n${names((c.insuranceClasses || []).filter((x) => x.insuranceCompanyId === s.selected_insurance_company_id && x.isAccepted !== false))}`; case 'INVALID_INSURANCE_CLASS': return `هذه الفئة غير صالحة للشركة المختارة.\nالفئات المتاحة:\n${names((c.insuranceClasses || []).filter((x) => x.insuranceCompanyId === s.selected_insurance_company_id && x.isAccepted !== false))}`; case 'INVALID_INSURANCE_COMPANY': return `شركة التأمين غير صالحة.\n${names(c.insuranceCompanies)}`; case 'PRICE_NOT_FOUND': return 'لا يوجد سعر مسجل لهذه الخيارات حاليًا 🌸'; case 'OFFER_BOOKING': return 'هل ترغبين في حجز موعد؟ 🌸'; case 'HANDOFF_TO_BOOKING': return ''; default: throw new Error(`Unsupported price action: ${d.action}`); } }
}
module.exports = PriceDecisionExecutor;
function displayAmount(value) { const number = Number(value); return Number.isFinite(number) ? String(number) : String(value); }
