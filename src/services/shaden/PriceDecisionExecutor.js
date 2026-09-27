'use strict';

const PriceReplyFormatter = require('./PriceReplyFormatter');
const ACTIONS = new Set(['ASK_PAYMENT_METHOD', 'ASK_INSURANCE_COMPANY', 'ASK_INSURANCE_CLASS',
  'INVALID_INSURANCE_COMPANY', 'INVALID_INSURANCE_CLASS', 'QUOTE_CASH_PRICE',
  'QUOTE_INSURANCE_PRICE', 'PRICE_NOT_FOUND', 'OFFER_BOOKING', 'HANDOFF_TO_BOOKING']);

class PriceDecisionExecutor {
  constructor({ priceService, policy, clock = { now: () => new Date() } }) {
    this.priceService = priceService;
    this.clock = clock;
    this.formatter = new PriceReplyFormatter(policy);
  }

  async execute(decision) {
    if (!decision || decision.owner !== 'PriceStateMachine' || !ACTIONS.has(decision.action)) {
      throw new TypeError('A complete PriceStateMachine decision with action is required.');
    }
    if (!['QUOTE_CASH_PRICE', 'QUOTE_INSURANCE_PRICE'].includes(decision.action)) return { type: 'NO_LOOKUP' };
    const cash = decision.action === 'QUOTE_CASH_PRICE';
    if (cash && (decision.evidence !== 'CURRENT' || decision.currentSlots.cash !== true ||
        decision.currentSlots.company || decision.provenance.cash !== 'CURRENT')) {
      throw new TypeError('Cash quote requires explicit CURRENT evidence.');
    }
    const request = decision.lookup;
    if (!request || !request.serviceId || !request.paymentMethodId ||
        (cash && (request.insuranceCompanyId || request.insuranceClassId)) ||
        (!cash && (!request.insuranceCompanyId || !request.insuranceClassId))) {
      throw new TypeError('Quote scope is incomplete.');
    }
    try {
      const quote = await this.priceService.resolvePrice({ ...request, bookingDate: this.clock.now() });
      const amount = Number(quote.price);
      if (!Number.isFinite(amount) || amount < 0 || !quote.currency) throw new TypeError('Invalid price result.');
      return { type: 'QUOTE_SUCCEEDED', amount, currency: quote.currency, rawAmount: String(quote.price) };
    } catch (error) {
      return { type: 'QUOTE_FAILED', reason: error.name };
    }
  }

  render(decision, catalog) { return this.formatter.format(decision, catalog); }
}
module.exports = PriceDecisionExecutor;
