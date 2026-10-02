'use strict';
const { matches } = require('./PriceCatalogMatcher');
const PriceInput = require('./PriceInput');
const { adapt, legacyProjection } = require('./LegacyPriceStateAdapter');
const { reduce } = require('./PriceStateReducer');

// The only component allowed to turn a price conversation into a decision.
class PriceStateMachine {
  constructor({ policy }) { this.policy = policy; }

  static owns(message, state, catalog, inquiry = null) {
    const text = PriceInput.normalizeInput(message, catalog);
    if (PriceInput.isPrice(text)) return true;
    if (state?.booking) return false;
    if (PriceStateMachine.isBookingConfirmation(text, adapt(state?.priceInquiry, catalog), inquiry)) return true;
    if (inquiry && ['branches', 'branch_address', 'services', 'services_under_specialty',
      'specialties', 'availability_request', 'working_hours', 'working_hours_city',
      'working_hours_branch', 'booking', 'booking_modification_request',
      'booking_cancellation_request', 'change_service_request', 'change_branch_request'].includes(inquiry.type)) {
      if (!(state?.priceInquiry && (PriceInput.isApproval(text) || PriceStateMachine.isRejection(text)))) return false;
    }
    const price = state?.priceInquiry;
    if (!price) return false;
    const grounded = PriceStateMachine.groundCurrentSlots(message, catalog);
    if (Object.keys(grounded).length) return true;
    const normalized = adapt(price, catalog);
    // A class label is interpreted within the insurer already selected by the
    // active price state. This is catalog scope, not sentence interpretation.
    if (normalized.insuranceCompanyId && matches(text,
      (catalog.insuranceClasses || []).filter(x => x.insuranceCompanyId === normalized.insuranceCompanyId)).length === 1) return true;
    if (normalized.pendingSlot === 'insuranceClass' && PriceInput.tokens(text).includes('فئه')) return true;
    if (normalized.pendingSlot === 'insuranceClass' && matches(text,
      (catalog.insuranceClasses || []).filter(x => x.insuranceCompanyId === normalized.insuranceCompanyId)).length === 1) return true;
    return normalized.pendingSlot === 'bookingConfirmation' &&
      (PriceInput.isApproval(text) || PriceStateMachine.isRejection(text));
  }

  static isRejection(text) {
    const words = PriceInput.tokens(text);
    return words[0] === 'لا' && words.slice(1).every(word => ['شكرا', 'شكراً'].includes(word));
  }

  static isBookingConfirmation(text, state, inquiry, bookingDecision = null) {
    return state?.status === 'quoted' && state.pendingSlot === 'bookingConfirmation' &&
      Number.isFinite(state.quote?.amount) && Boolean(state.serviceId && state.paymentMethodId) &&
      (bookingDecision === 'affirm' || inquiry?.type === 'booking' || PriceInput.isApproval(text));
  }

  static currentInquiry(inquiry, semanticMeaning) {
    if (inquiry?.type && inquiry.type !== 'unknown') return inquiry;
    if (semanticMeaning?.status === 'UNDERSTOOD' && semanticMeaning.goal === 'ACT' &&
        semanticMeaning.subjects?.some(x => x.source === 'CURRENT' && x.kind === 'APPOINTMENT')) {
      return { type: 'booking' };
    }
    const kinds = new Set((semanticMeaning?.subjects || []).filter(x => x.source === 'CURRENT').map(x => x.kind));
    for (const [kind, type] of [['BRANCH', 'branches'], ['SERVICES', 'services'],
      ['SPECIALTY', 'specialties'], ['AVAILABILITY', 'availability_request']]) {
      if (kinds.has(kind)) return { type };
    }
    return inquiry || { type: 'unknown' };
  }

  // Ground every price slot from the current surface against catalog IDs.  The
  // semantic interpreter may enrich unrelated flows, but it is never the type
  // authority for a price entity.
  static groundCurrentSlots(message, catalog = {}, supplied = {}) {
    const text = PriceInput.normalizeInput(message, catalog);
    const one = (items) => {
      const found = matches(text, items || []);
      return found.length === 1 ? found[0] : null;
    };
    const byId = (items, value) => (items || []).find((item) => item.id === value) || null;
    const result = {};
    const service = byId(catalog.services, supplied.serviceId) || one(catalog.services);
    const company = byId(catalog.insuranceCompanies, supplied.insuranceCompanyId) || one(catalog.insuranceCompanies);
    const insuranceClass = byId(catalog.insuranceClasses, supplied.insuranceClassId) || one(catalog.insuranceClasses);
    const explicitPayment = byId(catalog.paymentMethods, supplied.paymentMethodId) ||
      (supplied.paymentMethod && (catalog.paymentMethods || []).find((item) => item.code === supplied.paymentMethod || item.id === supplied.paymentMethod)) ||
      one(catalog.paymentMethods);
    if (service) result.serviceId = service.id;
    if (company) result.insuranceCompanyId = company.id;
    if (insuranceClass) result.insuranceClassId = insuranceClass.id;
    if (company || explicitPayment?.code === 'insurance' || supplied.insurance === true || /(تامين|تأمين)/.test(text)) {
      result.paymentMethod = 'insurance';
      result.insurance = true;
    } else if (explicitPayment?.code === 'cash' || /(كاش|نقدي)/.test(text)) {
      result.paymentMethod = 'cash';
      // Cash is the one price slot that is not safely inferable from an ID
      // supplied by another layer: quoting cash needs explicit surface evidence.
      if (/(كاش|نقدي)/.test(text)) result.cash = true;
    }
    return result;
  }

  async prepare(input, priceService) {
    const preliminary = this.decide(input);
    if (preliminary.action === 'YIELD') return preliminary;
    const serviceId = preliminary.nextPriceState?.serviceId;
    const method = (input.catalog.paymentMethods || []).find(item => item.code === 'insurance');
    if (!serviceId || preliminary.nextPriceState.paymentMethod !== 'insurance' ||
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

  decide({ message, currentSlots = {}, persistedPriceState = null, catalog = {}, currentInquiry = null, activeBooking = null }) {
    this.catalog = catalog;
    const text = PriceInput.normalizeInput(message, catalog);
    const inquiry = currentInquiry || this.policy.recognize(text);
    const bookingDecision = currentSlots.bookingDecision || null;
    if ((activeBooking && !PriceInput.isPrice(text)) || (persistedPriceState && !Object.keys(currentSlots).length &&
        !PriceStateMachine.owns(message, { priceInquiry: persistedPriceState, booking: activeBooking }, catalog, inquiry))) {
      return { owner: 'PriceStateMachine', kind: 'PRICE', action: 'YIELD', preserveState: true,
        nextPriceState: persistedPriceState, currentSlots: {}, invalidatedSlots: [],
        persistedSlots: persistedPriceState, resolvedSlots: persistedPriceState,
        missingSlots: [], provenance: {}, evidence: null };
    }
    // Transition order is deliberately fixed: current catalog grounding,
    // dependency invalidation, legacy migration, reduction, then execution.
    // `reduce` owns invalidation/reduction; it never lets persisted slots win.
    const current = PriceStateMachine.groundCurrentSlots(message, catalog, currentSlots);
    // The slot contract cannot manufacture explicit cash evidence.
    if (current.cash !== true) delete current.cash;
    const persisted = adapt(persistedPriceState, catalog);
    if (!activeBooking && !PriceInput.isPrice(text) &&
        PriceStateMachine.isBookingConfirmation(text, persisted, inquiry, bookingDecision)) {
      const base = legacyProjection(persisted, catalog);
      return this.withAction(this.decisionBase(base, {}, base, []), 'HANDOFF_TO_BOOKING', persisted);
    }
    const companyId = current.insuranceCompanyId || persisted.insuranceCompanyId;
    const scoped = matches(text, this.classesFor(companyId, catalog));
    if (scoped.length === 1) {
      current.insuranceClassId = scoped[0].id;
      // A class-only reply belongs to the pending class, even if a service
      // happens to share its catalog label.
      if (persisted.pendingSlot === 'insuranceClass' &&
          this.policy.normalize(text) === this.policy.normalize(scoped[0].name)) delete current.serviceId;
    }
    const reduced = reduce(persistedPriceState, current, catalog);
    const base = { ...this.empty(), ...legacyProjection(persisted, catalog) };
    const resolved = legacyProjection(reduced.state, catalog);
    const invalidatedSlots = reduced.invalidated;
    const method = (catalog.paymentMethods || []).find(item => item.code === resolved.selected_payment_method);
    resolved.selected_payment_method_id = method?.id || null;
    const common = { ...this.decisionBase(base, current, resolved, invalidatedSlots),
      transitionStages: { grounded: { ...current }, reduced: structuredClone(reduced.state) },
      unknownService: !resolved.selected_service_id && !this.isGeneralInquiry(text),
      lookup: { clinicId: catalog.clinic?.id, serviceId: resolved.selected_service_id,
        paymentMethodId: method?.id, ...(resolved.selected_payment_method === 'insurance'
          ? { insuranceCompanyId: resolved.selected_insurance_company_id, insuranceClassId: resolved.selected_insurance_class_id } : {}) },
      options: { companies: catalog.applicable?.companies || catalog.insuranceCompanies || [],
        classes: this.classesFor(resolved.selected_insurance_company_id, catalog) } };

    if (base.state === 'awaiting_price_insurance_class' && !current.insuranceClassId &&
        ['UNKNOWN', 'AMBIGUOUS', 'NOT_FOUND'].includes(message?.status)) {
      return this.withAction(common, 'ASK_INSURANCE_CLASS', base);
    }

    if (this.isGeneralInquiry(text) && !current.serviceId) {
      return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
    }
    if (base.state === 'awaiting_price_booking_confirmation' &&
        (bookingDecision === 'decline' || PriceStateMachine.isRejection(text)) && !Object.keys(current).length) {
      return this.withAction({ ...common, dismissed: true }, 'OFFER_BOOKING', null);
    }
    if (!activeBooking && (bookingDecision === 'affirm' || this.bookingConfirmation(text)) && base.state === 'awaiting_price_booking_confirmation' &&
        base.quoteCompleted === true && Number.isFinite(base.amount) && !Object.keys(current).length) {
      return this.withAction({ ...common, kind: 'PRICE', owner: 'PriceStateMachine' }, 'HANDOFF_TO_BOOKING', base);
    }
    if (!resolved.selected_service_id) return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
    if (!catalog.services.some(item => item.id === resolved.selected_service_id)) return this.withAction(common, 'ASK_PAYMENT_METHOD', this.empty());
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
          (!current.insuranceClassId && PriceInput.tokens(text).includes('فئه') && !['UNKNOWN', 'AMBIGUOUS', 'NOT_FOUND'].includes(message?.status))) {
        return this.withAction(common, 'INVALID_INSURANCE_CLASS', { ...resolved, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_insurance_price: null, state: 'awaiting_price_insurance_class' });
      }
      if (!resolved.selected_insurance_class_id) return this.withAction(common, 'ASK_INSURANCE_CLASS', { ...resolved, state: 'awaiting_price_insurance_class' });
      if (!method) return this.withAction(common, 'PRICE_NOT_FOUND', resolved);
      return this.withAction(common, 'QUOTE_INSURANCE_PRICE', { ...resolved, state: 'awaiting_price_booking_confirmation' });
    }
    if (resolved.selected_payment_method === 'insurance' || current.insuranceClassId) return this.withAction(common, 'ASK_INSURANCE_COMPANY', { ...resolved, selected_payment_method: 'insurance', state: 'awaiting_price_insurance_company' });
    return this.withAction(common, 'ASK_PAYMENT_METHOD', { ...resolved, state: 'awaiting_price_payment_method' });
  }

  withAction(decision, action, nextPriceState) {
    const v2 = nextPriceState ? adapt(nextPriceState, this.catalog) : null;
    return { ...decision, action, nextPriceState: v2, resolvedSlots: v2,
      transitionStages: { ...decision.transitionStages, normalized: v2 ? structuredClone(v2) : null },
      missingSlots: v2 ? this.missing(legacyProjection(v2, this.catalog)) : [] };
  }
  complete(decision, outcome) {
    if (outcome.type === 'NO_LOOKUP') return decision;
    const state = { ...legacyProjection(decision.nextPriceState, this.catalog), resolved_cash_price: null, resolved_insurance_price: null,
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
    for (const [key, field] of [['serviceId', 'selected_service_id'], ['insuranceCompanyId', 'selected_insurance_company_id'],
      ['insuranceClassId', 'selected_insurance_class_id']]) {
      if (resolved[field]) provenance[key] = current[key] ? 'CURRENT' : 'PERSISTED';
    }
    for (const key of Object.keys(current)) provenance[key] = 'CURRENT';
    return { kind: 'PRICE', owner: 'PriceStateMachine', action: 'ASK_PAYMENT_METHOD',
      currentSlots: current, persistedSlots: persisted, resolvedSlots: resolved,
      missingSlots: this.missing(resolved), invalidatedSlots, provenance,
      evidence: current.cash && !current.insuranceCompanyId ? 'CURRENT' : null };
  }
  empty() { return { intent: 'price_inquiry', state: 'awaiting_price_service', selected_service_id: null, selected_service_name: null, selected_payment_method: null, selected_insurance_company_id: null, selected_insurance_company_name: null, selected_insurance_class_id: null, selected_insurance_class_name: null, resolved_cash_price: null, resolved_insurance_price: null, currency: null }; }
  normalise(value) { return value ? { ...this.empty(), ...legacyProjection(value, this.catalog) } : this.empty(); }
  toState(s) { return { ...this.empty(), state: s.state || 'awaiting_price_payment_method', selected_service_id: s.service?.id || s.selected_service_id || null, selected_service_name: s.service?.name || s.selected_service_name || null, selected_payment_method: s.payment || s.selected_payment_method || null, selected_insurance_company_id: s.company?.id || s.selected_insurance_company_id || null, selected_insurance_company_name: s.company?.name || s.selected_insurance_company_name || null, selected_insurance_class_id: s.insuranceClass?.id || s.selected_insurance_class_id || null, selected_insurance_class_name: s.insuranceClass?.name || s.selected_insurance_class_name || null, resolved_cash_price: s.cashPrice || s.resolved_cash_price || null, resolved_insurance_price: s.insurancePrice || s.resolved_insurance_price || null, currency: s.currency || null, amount: s.amount ?? null, quoteCompleted: s.quoteCompleted === true }; }
  missing(s) { return ['selected_service_id', 'selected_payment_method', ...(s.selected_payment_method === 'insurance' ? ['selected_insurance_company_id', 'selected_insurance_class_id'] : [])].filter((k) => !s[k]); }
  classesFor(companyId, catalog) { return (catalog.applicable?.classes || catalog.insuranceClasses || []).filter((x) => x.insuranceCompanyId === companyId && x.isAccepted !== false); }
  bookingConfirmation(text) { return PriceInput.isApproval(text); }
  isGeneralInquiry(text) { return PriceInput.isGeneral(text); }
}
module.exports = PriceStateMachine;
