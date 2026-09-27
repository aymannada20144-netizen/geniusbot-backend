'use strict';
const { matches } = require('./PriceCatalogMatcher');
const PriceInput = require('./PriceInput');

// The only component allowed to turn a price conversation into a decision.
class PriceStateMachine {
  constructor({ policy }) { this.policy = policy; }

  static owns(message, state, catalog) {
    return Boolean(state?.priceInquiry) || PriceInput.isPrice(PriceInput.normalizeInput(message, catalog));
  }

  async prepare(input, priceService) {
    const preliminary = this.decide(input);
    const serviceId = preliminary.nextPriceState?.selected_service_id;
    const method = (input.catalog.paymentMethods || []).find(item => item.code === 'insurance');
    if (!serviceId || preliminary.nextPriceState.selected_payment_method !== 'insurance' ||
        preliminary.action === 'HANDOFF_TO_BOOKING' || preliminary.sideInquiry || !method ||
        typeof priceService?.listApplicableInsuranceOptions !== 'function') return preliminary;
    let applicable;
    try {
      applicable = await priceService.listApplicableInsuranceOptions({
        clinicId: input.catalog.clinic.id, serviceId, paymentMethodId: method.id,
      });
    } catch {
      return this.withAction(preliminary, 'PRICE_NOT_FOUND', { ...preliminary.nextPriceState, quoteCompleted: false, amount: null, resolved_cash_price: null, resolved_insurance_price: null, state: 'price_inquiry_ready' });
    }
    return this.decide({ ...input, catalog: { ...input.catalog, applicable } });
  }

  decide({ message, currentSlots = {}, persistedPriceState = null, catalog = {} }) {
    const text = PriceInput.normalizeInput(message, catalog);
    const extracted = this.extract(text, catalog);
    const supplied = this.groundSlots(currentSlots, catalog);
    const current = { ...extracted, ...supplied };
    // The slot contract cannot manufacture explicit cash evidence.
    if (!extracted.cash) delete current.cash;
    const base = this.normalise(persistedPriceState);
    const companyId = current.company?.id || base.selected_insurance_company_id;
    const scoped = this.extract(text, { insuranceClasses: (catalog.insuranceClasses || []).filter(item => item.insuranceCompanyId === companyId) });
    if (!supplied.insuranceClass && scoped.insuranceClass) current.insuranceClass = scoped.insuranceClass;
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
    if (invalidatedSlots.length || current.insuranceClass || current.cash || current.insurance) {
      slots.amount = null;
      slots.quoteCompleted = false;
      slots.resolved_cash_price = null;
      slots.resolved_insurance_price = null;
      slots.currency = null;
    }
    if (current.company || current.insurance) slots.payment = 'insurance';
    if (current.cash && !current.company) {
      slots.payment = 'cash';
      slots.company = null;
      slots.insuranceClass = null;
      Object.assign(slots, { selected_insurance_company_id: null, selected_insurance_company_name: null, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_insurance_price: null });
    }
    const resolved = this.toState(slots, catalog);
    const method = (catalog.paymentMethods || []).find(item => item.code === resolved.selected_payment_method);
    resolved.selected_payment_method_id = method?.id || null;
    const common = { ...this.decisionBase(base, current, resolved, invalidatedSlots),
      unknownService: !resolved.selected_service_id && !this.isGeneralInquiry(text),
      lookup: { clinicId: catalog.clinic?.id, serviceId: resolved.selected_service_id,
        paymentMethodId: method?.id, ...(resolved.selected_payment_method === 'insurance'
          ? { insuranceCompanyId: resolved.selected_insurance_company_id, insuranceClassId: resolved.selected_insurance_class_id } : {}) },
      options: { companies: catalog.applicable?.companies || catalog.insuranceCompanies || [],
        classes: this.classesFor(resolved.selected_insurance_company_id, catalog) } };

    if (base.state === 'awaiting_price_insurance_class' &&
        ['UNKNOWN', 'AMBIGUOUS', 'NOT_FOUND'].includes(message?.status)) {
      return this.withAction(common, 'ASK_INSURANCE_CLASS', base);
    }

    if (this.isGeneralInquiry(text) && !current.service) {
      return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
    }
    const sideInquiry = this.policy.recognize(text);
    if (persistedPriceState && ['branches', 'working_hours', 'services'].includes(sideInquiry.type) && !PriceInput.isPrice(text)) {
      return this.withAction({ ...common, sideInquiry }, this.clarification(base), base);
    }
    if (base.state === 'awaiting_price_booking_confirmation' &&
        this.policy.normalize(text).split(' ')[0] === 'لا' && !Object.keys(current).length) {
      return this.withAction({ ...common, dismissed: true }, 'OFFER_BOOKING', null);
    }
    if (this.bookingConfirmation(text) && base.state === 'awaiting_price_booking_confirmation' &&
        base.quoteCompleted === true && Number.isFinite(base.amount) && !Object.keys(current).length) {
      return { ...common, kind: 'PRICE', owner: 'PriceStateMachine', action: 'HANDOFF_TO_BOOKING', nextPriceState: base };
    }
    if (!resolved.selected_service_id) return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
    if (!catalog.services.some(item => item.id === resolved.selected_service_id)) return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
    if (base.quoteCompleted && !Object.keys(current).length && !PriceInput.isPrice(text) &&
        !PriceInput.tokens(text).includes('فئه')) return this.withAction(common, 'OFFER_BOOKING', base);
    if (base.state === 'price_inquiry_ready' && !Object.keys(current).length && !PriceInput.isPrice(text)) {
      return this.withAction(common, 'PRICE_NOT_FOUND', base);
    }
    if (resolved.selected_payment_method === 'cash') {
      if (!current.cash) return this.withAction(common, 'ASK_PAYMENT_METHOD', { ...resolved, selected_payment_method: null, selected_payment_method_id: null });
      if (!method) return this.withAction(common, 'PRICE_NOT_FOUND', resolved);
      return this.withAction(common, 'QUOTE_CASH_PRICE', { ...resolved, state: 'awaiting_price_booking_confirmation' });
    }
    if (resolved.selected_insurance_company_id) {
      if (!common.options.companies.some(item => item.id === resolved.selected_insurance_company_id)) {
        return this.withAction(common, 'INVALID_INSURANCE_COMPANY', { ...resolved, selected_insurance_class_id: null, selected_insurance_class_name: null, state: 'awaiting_price_insurance_company' });
      }
      const validClasses = this.classesFor(resolved.selected_insurance_company_id, catalog);
      if ((resolved.selected_insurance_class_id && !validClasses.some((x) => x.id === resolved.selected_insurance_class_id)) ||
          (!current.insuranceClass && PriceInput.tokens(text).includes('فئه') && !['UNKNOWN', 'AMBIGUOUS', 'NOT_FOUND'].includes(message?.status))) {
        return this.withAction(common, 'INVALID_INSURANCE_CLASS', { ...resolved, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_insurance_price: null, state: 'awaiting_price_insurance_class' });
      }
      if (!resolved.selected_insurance_class_id) return this.withAction(common, 'ASK_INSURANCE_CLASS', { ...resolved, state: 'awaiting_price_insurance_class' });
      if (!method) return this.withAction(common, 'PRICE_NOT_FOUND', resolved);
      return this.withAction(common, 'QUOTE_INSURANCE_PRICE', { ...resolved, state: 'awaiting_price_booking_confirmation' });
    }
    if (resolved.selected_payment_method === 'insurance' || current.insuranceClass) return this.withAction(common, 'ASK_INSURANCE_COMPANY', { ...resolved, selected_payment_method: 'insurance', state: 'awaiting_price_insurance_company' });
    return this.withAction(common, 'ASK_PAYMENT_METHOD', { ...resolved, state: 'awaiting_price_payment_method' });
  }

  withAction(decision, action, nextPriceState) {
    return { ...decision, action, nextPriceState, resolvedSlots: nextPriceState,
      missingSlots: nextPriceState ? this.missing(nextPriceState) : [] };
  }
  clarification(state) {
    if (state.quoteCompleted) return 'OFFER_BOOKING';
    if (!state.selected_payment_method) return 'ASK_PAYMENT_METHOD';
    if (!state.selected_insurance_company_id) return 'ASK_INSURANCE_COMPANY';
    return 'ASK_INSURANCE_CLASS';
  }
  groundSlots(slots, catalog) {
    const result = {};
    for (const [key, field, collection] of [['service', 'serviceId', 'services'],
      ['company', 'insuranceCompanyId', 'insuranceCompanies'], ['insuranceClass', 'insuranceClassId', 'insuranceClasses']]) {
      if (slots[key] !== undefined || slots[field] !== undefined) {
        const id = slots[key]?.id ?? slots[field];
        result[key] = (catalog[collection] || []).find(item => item.id === id) || { id, invalid: true };
      }
    }
    if (slots.paymentMethod === 'insurance' || slots.insurance) result.insurance = true;
    return result;
  }
  complete(decision, outcome) {
    if (outcome.type === 'NO_LOOKUP') return decision;
    const state = { ...decision.nextPriceState, resolved_cash_price: null, resolved_insurance_price: null,
      amount: null, currency: null, quoteCompleted: false };
    if (outcome.type === 'QUOTE_FAILED') {
      state.state = 'price_inquiry_ready';
      return this.withAction(decision, 'PRICE_NOT_FOUND', state);
    }
    state.amount = outcome.amount;
    state.currency = outcome.currency;
    state.quoteCompleted = true;
    state.quotedPrice = outcome.rawAmount;
    state.state = 'awaiting_price_booking_confirmation';
    state[decision.action === 'QUOTE_CASH_PRICE' ? 'resolved_cash_price' : 'resolved_insurance_price'] = outcome.rawAmount;
    return this.withAction(decision, decision.action, state);
  }
  decisionBase(persisted, current, resolved, invalidatedSlots) {
    const provenance = {};
    for (const [key, field] of [['service', 'selected_service_id'], ['company', 'selected_insurance_company_id'],
      ['insuranceClass', 'selected_insurance_class_id']]) {
      if (resolved[field]) provenance[key] = current[key] ? 'CURRENT' : 'PERSISTED';
    }
    for (const key of Object.keys(current)) provenance[key] = 'CURRENT';
    return { kind: 'PRICE', owner: 'PriceStateMachine', action: 'ASK_PAYMENT_METHOD',
      currentSlots: current, persistedSlots: persisted, resolvedSlots: resolved,
      missingSlots: this.missing(resolved), invalidatedSlots, provenance,
      evidence: current.cash && !current.company ? 'CURRENT' : null };
  }
  empty() { return { intent: 'price_inquiry', state: 'awaiting_price_service', selected_service_id: null, selected_service_name: null, selected_payment_method: null, selected_insurance_company_id: null, selected_insurance_company_name: null, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_cash_price: null, resolved_insurance_price: null, currency: null }; }
  normalise(value) { return value && value.intent === 'price_inquiry' ? { ...this.empty(), ...value } : this.empty(); }
  toState(s) { return { ...this.empty(), state: s.state || 'awaiting_price_payment_method', selected_service_id: s.service?.id || s.selected_service_id || null, selected_service_name: s.service?.name || s.selected_service_name || null, selected_payment_method: s.payment || s.selected_payment_method || null, selected_insurance_company_id: s.company?.id || s.selected_insurance_company_id || null, selected_insurance_company_name: s.company?.name || s.selected_insurance_company_name || null, selected_insurance_class_id: s.insuranceClass?.id || s.selected_insurance_class_id || null, selected_insurance_class_name: s.insuranceClass?.name || s.selected_insurance_class_name || null, resolved_cash_price: s.cashPrice || s.resolved_cash_price || null, resolved_insurance_price: s.insurancePrice || s.resolved_insurance_price || null, currency: s.currency || null, amount: s.amount ?? null, quoteCompleted: s.quoteCompleted === true }; }
  missing(s) { return ['selected_service_id', 'selected_payment_method', ...(s.selected_payment_method === 'insurance' ? ['selected_insurance_company_id', 'selected_insurance_class_id'] : [])].filter((k) => !s[k]); }
  classesFor(companyId, catalog) { return (catalog.applicable?.classes || catalog.insuranceClasses || []).filter((x) => x.insuranceCompanyId === companyId && x.isAccepted !== false); }
  extract(text, catalog) { const n = this.policy.normalize(text); const match = (items) => matches(n, items);
    const one = (items) => { const v = match(items); return v.length === 1 ? v[0] : null; };
    const service = one(catalog.services); const company = one(catalog.insuranceCompanies); const insuranceClass = one(catalog.insuranceClasses);
    return { ...(service ? { service } : {}), ...(company ? { company } : {}), ...(insuranceClass ? { insuranceClass } : {}), ...( /(كاش|نقدي)/.test(n) ? { cash: true } : {}), ...( /(تامين|تأمين)/.test(n) ? { insurance: true } : {}) }; }
  bookingConfirmation(text) { return PriceInput.isApproval(text); }
  isGeneralInquiry(text) { return PriceInput.isGeneral(text); }
}
module.exports = PriceStateMachine;
