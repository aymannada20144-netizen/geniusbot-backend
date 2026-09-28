'use strict';
const PriceState = require('./PriceState');
const { SCHEMA_VERSION } = PriceState;
const entity = (items, id) => (items || []).find(item => item.id === id);

// Only ingress accepts historical object/V1 contracts. All outputs use IDs.
function adapt(value, catalog = {}) {
  const v = value || {};
  const state = PriceState.create();
  state.serviceId = entity(catalog.services, v.serviceId ?? v.service?.id ?? v.selected_service_id)?.id || null;
  state.insuranceCompanyId = entity(catalog.insuranceCompanies,
    v.insuranceCompanyId ?? v.insuranceCompany?.id ?? v.selected_insurance_company_id)?.id || null;
  const requested = typeof v.paymentMethod === 'string' ? v.paymentMethod :
    v.paymentMethod?.code ?? v.selected_payment_method;
  state.paymentMethod = state.insuranceCompanyId ? 'insurance' :
    ['cash', 'insurance'].includes(requested) ? requested : null;
  state.paymentMethodId = (catalog.paymentMethods || []).find(x => x.code === state.paymentMethod)?.id || null;
  const cls = entity(catalog.insuranceClasses, v.insuranceClassId ?? v.insuranceClass?.id ?? v.selected_insurance_class_id);
  state.insuranceClassId = cls && cls.isAccepted !== false && state.insuranceCompanyId &&
    cls.insuranceCompanyId === state.insuranceCompanyId ? cls.id : null;
  const raw = state.paymentMethod === 'cash' ? v.resolved_cash_price : v.resolved_insurance_price;
  const quote = v.quote || (v.quoteCompleted === true && raw != null ?
    { amount: Number(raw), currency: v.currency, rawAmount: String(raw) } : null);
  if (quote && Number.isFinite(quote.amount) && typeof quote.currency === 'string' &&
      state.serviceId && state.paymentMethod && requested === state.paymentMethod &&
      (state.paymentMethod !== 'insurance' || state.insuranceClassId)) state.quote = { ...quote };
  state.pendingSlot = pending(state);
  state.status = state.quote ? 'quoted' :
    (v.status === 'price_not_found' || v.state === 'price_inquiry_ready') ? 'price_not_found' :
      'awaiting_' + (state.pendingSlot || 'service');
  if (state.insuranceCompanyId && !state.insuranceClassId) state.status = 'awaiting_insuranceClass';
  for (const key of ['serviceId', 'paymentMethod', 'insuranceCompanyId', 'insuranceClassId']) {
    if (state[key]) state.provenance[key] = v.provenance?.[key] || 'PERSISTED';
  }
  return expose(state, catalog);
}
function pending(s) {
  if (!s.serviceId) return 'service';
  if (!s.paymentMethod) return 'paymentMethod';
  if (s.paymentMethod === 'insurance' && !s.insuranceCompanyId) return 'insuranceCompany';
  if (s.paymentMethod === 'insurance' && !s.insuranceClassId) return 'insuranceClass';
  return s.quote ? 'bookingConfirmation' : null;
}
function legacyProjection(value, catalog = {}) {
  const s = value && Object.hasOwn(value, 'serviceId') ? value : adapt(value, catalog);
  return {
    intent: 'price_inquiry', state: s.status === 'quoted' ? 'awaiting_price_booking_confirmation' :
      s.status === 'price_not_found' ? 'price_inquiry_ready' : 'awaiting_price_' +
        ({ paymentMethod: 'payment_method', insuranceCompany: 'insurance_company', insuranceClass: 'insurance_class' }[s.pendingSlot] || 'service'),
    selected_service_id: s.serviceId, selected_service_name: entity(catalog.services, s.serviceId)?.name || null,
    selected_payment_method: s.paymentMethod, selected_payment_method_id: s.paymentMethodId,
    selected_insurance_company_id: s.insuranceCompanyId,
    selected_insurance_company_name: entity(catalog.insuranceCompanies, s.insuranceCompanyId)?.name || null,
    selected_insurance_class_id: s.insuranceClassId,
    selected_insurance_class_name: entity(catalog.insuranceClasses, s.insuranceClassId)?.name || null,
    resolved_cash_price: s.paymentMethod === 'cash' ? s.quote?.rawAmount || null : null,
    resolved_insurance_price: s.paymentMethod === 'insurance' ? s.quote?.rawAmount || null : null,
    amount: s.quote?.amount ?? null, currency: s.quote?.currency || null,
    quoteCompleted: Boolean(s.quote), quotedPrice: s.quote?.rawAmount || null,
  };
}
function expose(state, catalog) {
  // Presentation compatibility only; these fields never enter JSON persistence.
  for (const key of Object.keys(legacyProjection(state, catalog))) {
    Object.defineProperty(state, key, { enumerable: false, configurable: true,
      get: () => legacyProjection(state, catalog)[key] });
  }
  return state;
}
module.exports = Object.freeze({ SCHEMA_VERSION, emptyPriceState: PriceState.create,
  adapt, sanitize: adapt, pending, legacyProjection });
