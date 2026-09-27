'use strict';

const PriceState = require('./PriceState');
const { SCHEMA_VERSION } = PriceState;

function emptyPriceState() {
  return PriceState.create();
}

function adapt(value, catalog = {}) {
  if (value?.schemaVersion === SCHEMA_VERSION) return sanitize(value, catalog);
  const state = emptyPriceState();
  if (!value || typeof value !== 'object') return state;
  state.service = entity(catalog.services, value.selected_service_id);
  state.paymentMethod = payment(catalog.paymentMethods, value.selected_payment_method);
  state.insuranceCompany = entity(catalog.insuranceCompanies, value.selected_insurance_company_id);
  state.insuranceClass = insuranceClass(catalog.insuranceClasses, value.selected_insurance_class_id, state.insuranceCompany?.id);
  const rawAmount = state.paymentMethod?.code === 'cash'
    ? value.resolved_cash_price : value.resolved_insurance_price;
  if (state.service && state.paymentMethod && value.quoteCompleted === true && finite(rawAmount) && typeof value.currency === 'string') {
    state.quote = { amount: Number(rawAmount), currency: value.currency, rawAmount: String(rawAmount) };
  }
  // A failed lookup is a terminal price result for this scope.  Preserve that
  // fact across the V1 -> V2 boundary so an unrelated reply cannot re-run it.
  state.status = value.state === 'price_inquiry_ready' ? 'price_not_found' : status(value.state, state);
  state.pendingSlot = pending(state);
  state.provenance = Object.fromEntries(Object.entries({
    service: state.service, paymentMethod: state.paymentMethod,
    insuranceCompany: state.insuranceCompany, insuranceClass: state.insuranceClass,
  }).filter(([, entry]) => entry).map(([key]) => [key, 'PERSISTED']));
  return exposeLegacyReadOnlyFields(state);
}

function sanitize(value, catalog = {}) {
  const state = emptyPriceState();
  state.service = entity(catalog.services, value.service?.id);
  state.paymentMethod = payment(catalog.paymentMethods, value.paymentMethod?.code || value.paymentMethod?.id);
  state.insuranceCompany = entity(catalog.insuranceCompanies, value.insuranceCompany?.id);
  state.insuranceClass = insuranceClass(catalog.insuranceClasses, value.insuranceClass?.id, state.insuranceCompany?.id);
  if (state.paymentMethod?.code !== 'insurance') {
    state.insuranceCompany = null;
    state.insuranceClass = null;
  }
  if (state.paymentMethod?.code === 'insurance' && !state.insuranceCompany) state.insuranceClass = null;
  if (value.quote && finite(value.quote.amount) && typeof value.quote.currency === 'string' &&
      state.service && state.paymentMethod && (state.paymentMethod.code !== 'insurance' || state.insuranceClass)) {
    state.quote = { amount: Number(value.quote.amount), currency: value.quote.currency,
      rawAmount: String(value.quote.rawAmount ?? value.quote.amount) };
  }
  state.status = typeof value.status === 'string' ? value.status : status(null, state);
  state.pendingSlot = pending(state);
  for (const key of ['service', 'paymentMethod', 'insuranceCompany', 'insuranceClass']) {
    if (state[key] && value.provenance?.[key] === 'CURRENT') state.provenance[key] = 'CURRENT';
    else if (state[key]) state.provenance[key] = 'PERSISTED';
  }
  return exposeLegacyReadOnlyFields(state);
}

function entity(items, id) { return (items || []).find(item => item.id === id) || null; }
function payment(items, value) { return (items || []).find(item => item.id === value || item.code === value) || null; }
function insuranceClass(items, id, companyId) {
  const item = entity(items, id);
  return companyId && item && item.isAccepted !== false && item.insuranceCompanyId === companyId ? item : null;
}
function finite(value) { return Number.isFinite(Number(value)); }
function pending(state) {
  if (!state.service) return 'service';
  if (!state.paymentMethod) return 'paymentMethod';
  if (state.paymentMethod.code === 'insurance' && !state.insuranceCompany) return 'insuranceCompany';
  if (state.paymentMethod.code === 'insurance' && !state.insuranceClass) return 'insuranceClass';
  return state.quote ? 'bookingConfirmation' : null;
}
function status(legacy, state) {
  if (state.quote) return 'quoted';
  return `awaiting_${pending(state) || 'service'}`;
}

function legacyProjection(value, catalog) {
  const state = value?.schemaVersion === SCHEMA_VERSION
    ? value
    : adapt(value, catalog);
  return {
    intent: 'price_inquiry', state: state.status === 'quoted'
      ? 'awaiting_price_booking_confirmation'
      : state.status === 'price_not_found'
        ? 'price_inquiry_ready'
        : `awaiting_price_${state.pendingSlot === 'paymentMethod' ? 'payment_method' :
        state.pendingSlot === 'insuranceCompany' ? 'insurance_company' :
          state.pendingSlot === 'insuranceClass' ? 'insurance_class' : 'service'}`,
    selected_service_id: state.service?.id || null,
    selected_service_name: state.service?.name || null,
    selected_payment_method: state.paymentMethod?.code || null,
    selected_payment_method_id: state.paymentMethod?.id || null,
    selected_insurance_company_id: state.insuranceCompany?.id || null,
    selected_insurance_company_name: state.insuranceCompany?.name || null,
    selected_insurance_class_id: state.insuranceClass?.id || null,
    selected_insurance_class_name: state.insuranceClass?.name || null,
    resolved_cash_price: state.paymentMethod?.code === 'cash' ? state.quote?.rawAmount || null : null,
    resolved_insurance_price: state.paymentMethod?.code === 'insurance' ? state.quote?.rawAmount || null : null,
    currency: state.quote?.currency || null,
    amount: state.quote?.amount ?? null,
    quoteCompleted: Boolean(state.quote),
    quotedPrice: state.quote?.rawAmount || null,
  };
}

// Transitional in-memory read surface for callers compiled against V1. These
// properties are non-enumerable, so persistence remains the V2 schema only.
function exposeLegacyReadOnlyFields(state) {
  const projection = () => legacyProjection(state, {});
  for (const key of ['intent', 'state', 'selected_service_id', 'selected_service_name',
    'selected_payment_method', 'selected_insurance_company_id', 'selected_insurance_company_name',
    'selected_insurance_class_id', 'selected_insurance_class_name', 'resolved_cash_price',
    'resolved_insurance_price', 'currency', 'amount', 'quoteCompleted', 'quotedPrice']) {
    if (Object.prototype.hasOwnProperty.call(state, key)) continue;
    Object.defineProperty(state, key, { enumerable: false, configurable: true,
      get: () => projection()[key] });
  }
  return state;
}

module.exports = Object.freeze({ SCHEMA_VERSION, emptyPriceState, adapt, sanitize, pending, legacyProjection });
