'use strict';

const { adapt, pending } = require('./LegacyPriceStateAdapter');

function reduce(persisted, current, catalog) {
  const state = adapt(persisted, catalog);
  const next = structuredClone(state);
  const invalidated = [];
  const set = (key, value) => {
    if (!value || next[key]?.id === value.id) return;
    next[key] = value;
    next.provenance[key] = 'CURRENT';
  };
  if (current.service && current.service.id !== next.service?.id) {
    set('service', current.service);
    Object.assign(next, { paymentMethod: null, insuranceCompany: null, insuranceClass: null, quote: null });
    invalidated.push('paymentMethod', 'insuranceCompany', 'insuranceClass', 'quote');
  }
  if (current.paymentMethod && current.paymentMethod.code !== next.paymentMethod?.code) {
    set('paymentMethod', current.paymentMethod);
    next.insuranceCompany = null;
    next.insuranceClass = null;
    next.quote = null;
    invalidated.push('insuranceCompany', 'insuranceClass', 'quote');
  }
  if (current.insuranceCompany && current.insuranceCompany.id !== next.insuranceCompany?.id) {
    set('insuranceCompany', current.insuranceCompany);
    next.paymentMethod = current.insurancePaymentMethod;
    next.provenance.paymentMethod = 'CURRENT';
    next.insuranceClass = null;
    next.quote = null;
    invalidated.push('insuranceClass', 'quote');
  }
  if (current.insuranceClass && current.insuranceClass.id !== next.insuranceClass?.id) {
    set('insuranceClass', current.insuranceClass);
    next.quote = null;
    invalidated.push('quote');
  }
  if (next.paymentMethod?.code !== 'insurance') {
    next.insuranceCompany = null;
    next.insuranceClass = null;
  }
  next.pendingSlot = pending(next);
  // A lookup failure belongs to the resolved scope.  Keep it until a CURRENT
  // slot changes that scope; otherwise a confirmation/retry message could
  // silently turn into another quote lookup.
  next.status = next.status === 'price_not_found' && invalidated.length === 0
    ? 'price_not_found'
    : next.quote ? 'quoted' : `awaiting_${next.pendingSlot || 'service'}`;
  return { state: next, invalidated };
}

module.exports = { reduce };
