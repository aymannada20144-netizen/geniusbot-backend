'use strict';
const { adapt } = require('./LegacyPriceStateAdapter');

function reduce(persisted, current, catalog) {
  const next = structuredClone(adapt(persisted, catalog));
  const invalidated = new Set();
  const clear = keys => keys.forEach(key => { next[key] = null; delete next.provenance[key]; invalidated.add(key); });
  if (current.serviceId && current.serviceId !== next.serviceId)
    clear(['paymentMethod', 'paymentMethodId', 'insuranceCompanyId', 'insuranceClassId', 'quote']);
  const method = current.insuranceCompanyId ? 'insurance' : current.paymentMethod;
  if (method && method !== next.paymentMethod) clear(['insuranceCompanyId', 'insuranceClassId', 'quote']);
  if (current.insuranceCompanyId && current.insuranceCompanyId !== next.insuranceCompanyId)
    clear(['insuranceClassId', 'quote']);
  if (current.insuranceClassId && current.insuranceClassId !== next.insuranceClassId) clear(['quote']);
  for (const key of ['serviceId', 'paymentMethod', 'insuranceCompanyId', 'insuranceClassId']) {
    if (current[key]) { next[key] = current[key]; next.provenance[key] = 'CURRENT'; }
  }
  if (next.insuranceCompanyId) next.paymentMethod = 'insurance';
  if (next.paymentMethod === 'cash') clear(['insuranceCompanyId', 'insuranceClassId']);
  if (invalidated.size) next.status = null;
  return { state: adapt(next, catalog), invalidated: [...invalidated] };
}
module.exports = { reduce };
