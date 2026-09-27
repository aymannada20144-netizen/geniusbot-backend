'use strict';

// The only component allowed to turn a price conversation into a decision.
class PriceStateMachine {
  constructor({ policy }) { this.policy = policy; }

  decide({ message, currentSlots = {}, persistedPriceState = null, catalog = {} }) {
    const text = String(message?.text ?? message ?? '');
    const p = this.policy;
    const current = { ...this.extract(text, catalog), ...currentSlots };
    const base = this.normalise(persistedPriceState);
    const companyId = current.company?.id || base.selected_insurance_company_id;
    const scoped = this.extract(text, { insuranceClasses: (catalog.insuranceClasses || []).filter(item => item.insuranceCompanyId === companyId) });
    if (!currentSlots.insuranceClass && scoped.insuranceClass) current.insuranceClass = scoped.insuranceClass;
    // Current message always wins; a new service/company invalidates dependent data.
    const slots = { ...base, ...current };
    const invalidatedSlots = [];
    if (current.service && current.service.id !== base.selected_service_id) {
      for (const key of ['payment', 'company', 'insuranceClass', 'cashPrice', 'insurancePrice']) delete slots[key];
      Object.assign(slots, { selected_payment_method: null, selected_insurance_company_id: null, selected_insurance_company_name: null, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_cash_price: null, resolved_insurance_price: null });
      invalidatedSlots.push('paymentMethod', 'insuranceCompany', 'insuranceClass', 'price');
    }
    if (current.company && current.company.id !== base.selected_insurance_company_id) {
      delete slots.insuranceClass; delete slots.insurancePrice;
      Object.assign(slots, { selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_insurance_price: null });
      invalidatedSlots.push('insuranceClass', 'price');
    }
    Object.assign(slots, current);
    if (current.company || current.insurance) slots.payment = 'insurance';
    if (current.cash && !current.company) {
      slots.payment = 'cash';
      slots.company = null;
      slots.insuranceClass = null;
      Object.assign(slots, { selected_insurance_company_id: null, selected_insurance_company_name: null, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_insurance_price: null });
    }
    const resolved = this.toState(slots, catalog);
    const common = this.decisionBase(base, current, resolved, invalidatedSlots);

    if (this.isGeneralInquiry(text) && !current.service) {
      return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
    }
    if (base.state === 'awaiting_price_booking_confirmation' &&
        this.policy.normalize(text).split(' ')[0] === 'لا' && !Object.keys(current).length) {
      return this.withAction({ ...common, dismissed: true }, 'OFFER_BOOKING', null);
    }
    if (this.bookingConfirmation(text) && base.state === 'awaiting_price_booking_confirmation' &&
        (base.resolved_cash_price || base.resolved_insurance_price)) {
      return { ...common, kind: 'PRICE', owner: 'PriceStateMachine', action: 'HANDOFF_TO_BOOKING', nextPriceState: base };
    }
    if (!resolved.selected_service_id) return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
    if (resolved.selected_payment_method === 'cash') {
      if (!current.cash) return this.withAction(common, 'ASK_PAYMENT_METHOD', resolved);
      return this.withAction(common, 'QUOTE_CASH_PRICE', { ...resolved, state: 'awaiting_price_booking_confirmation' });
    }
    if (resolved.selected_insurance_company_id) {
      const validClasses = this.classesFor(resolved.selected_insurance_company_id, catalog);
      if (current.insuranceClass && !validClasses.some((x) => x.id === current.insuranceClass.id)) {
        return this.withAction(common, 'INVALID_INSURANCE_CLASS', { ...resolved, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_insurance_price: null, state: 'awaiting_price_insurance_class' });
      }
      if (!resolved.selected_insurance_class_id) return this.withAction(common, 'ASK_INSURANCE_CLASS', { ...resolved, state: 'awaiting_price_insurance_class' });
      return this.withAction(common, 'QUOTE_INSURANCE_PRICE', { ...resolved, state: 'awaiting_price_booking_confirmation' });
    }
    if (resolved.selected_payment_method === 'insurance' || current.insuranceClass) return this.withAction(common, 'ASK_INSURANCE_COMPANY', { ...resolved, selected_payment_method: 'insurance', state: 'awaiting_price_insurance_company' });
    return this.withAction(common, 'ASK_PAYMENT_METHOD', { ...resolved, state: 'awaiting_price_payment_method' });
  }

  withAction(decision, action, nextPriceState) { return { ...decision, action, nextPriceState, resolvedSlots: nextPriceState, missingSlots: nextPriceState ? this.missing(nextPriceState) : [] }; }
  decisionBase(persisted, current, resolved, invalidatedSlots) {
    return { kind: 'PRICE', owner: 'PriceStateMachine', action: 'ASK_PAYMENT_METHOD', currentSlots: current, persistedSlots: persisted, resolvedSlots: resolved, missingSlots: this.missing(resolved), invalidatedSlots, provenance: Object.fromEntries(Object.keys(current).map((k) => [k, 'CURRENT'])), evidence: current.cash ? 'CURRENT' : null };
  }
  empty() { return { intent: 'price_inquiry', state: 'awaiting_price_service', selected_service_id: null, selected_service_name: null, selected_payment_method: null, selected_insurance_company_id: null, selected_insurance_company_name: null, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_cash_price: null, resolved_insurance_price: null, currency: null }; }
  normalise(value) { return value && value.intent === 'price_inquiry' ? { ...this.empty(), ...value } : this.empty(); }
  toState(s) { return { ...this.empty(), state: s.state || 'awaiting_price_payment_method', selected_service_id: s.service?.id || s.selected_service_id || null, selected_service_name: s.service?.name || s.selected_service_name || null, selected_payment_method: s.payment || s.selected_payment_method || null, selected_insurance_company_id: s.company?.id || s.selected_insurance_company_id || null, selected_insurance_company_name: s.company?.name || s.selected_insurance_company_name || null, selected_insurance_class_id: s.insuranceClass?.id || s.selected_insurance_class_id || null, selected_insurance_class_name: s.insuranceClass?.name || s.selected_insurance_class_name || null, resolved_cash_price: s.cashPrice || s.resolved_cash_price || null, resolved_insurance_price: s.insurancePrice || s.resolved_insurance_price || null, currency: s.currency || null }; }
  missing(s) { return ['selected_service_id', 'selected_payment_method', ...(s.selected_payment_method === 'insurance' ? ['selected_insurance_company_id', 'selected_insurance_class_id'] : [])].filter((k) => !s[k]); }
  classesFor(companyId, catalog) { return (catalog.insuranceClasses || []).filter((x) => x.insuranceCompanyId === companyId && x.isAccepted !== false); }
  extract(text, catalog) { const n = this.policy.normalize(text); const match = (items) => (items || []).filter((x) => this.compact(n).includes(this.compact(x.name)) || this.compact(x.name).includes(this.compact(n)));
    const one = (items) => { const v = match(items); return v.length === 1 ? v[0] : null; };
    const service = one(catalog.services); const company = one(catalog.insuranceCompanies); const insuranceClass = one(catalog.insuranceClasses);
    return { ...(service ? { service } : {}), ...(company ? { company } : {}), ...(insuranceClass ? { insuranceClass } : {}), ...( /(كاش|نقدي)/.test(n) ? { cash: true } : {}), ...( /(تامين|تأمين)/.test(n) ? { insurance: true } : {}) }; }
  compact(value) { return this.policy.normalize(String(value || '')).replace(/ال/g, '').replace(/[^\p{L}\p{N}]/gu, ''); }
  bookingConfirmation(text) { return /^(نعم|اي|ايوه|ايوا|تمام|موافق|اكيد|احجز|احجزي|حجز|ابدأ الحجز)$/.test(this.policy.normalize(text).trim()); }
  isGeneralInquiry(text) { return /^(?:ما )?اسعار(?: الخدمات| خدماتكم|كم)?$/.test(this.policy.normalize(text).trim().replace(/\s+/g, ' ')); }
}
module.exports = PriceStateMachine;
