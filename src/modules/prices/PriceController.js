'use strict';

class PriceController {
  constructor(priceService) {
    if (!priceService) throw new TypeError('PriceController requires priceService.');
    this.priceService = priceService;
  }

  async list(request, reply) {
    const data = await this.priceService.listPrices(
      request.params.clinicId,
      request.query || {}
    );
    return reply.send({ success: true, data });
  }

  async get(request, reply) {
    const data = await this.priceService.getPrice(
      request.params.clinicId,
      request.params.priceId
    );
    return reply.send({ success: true, data });
  }

  async create(request, reply) {
    const data = await this.priceService.createPrice(
      request.params.clinicId,
      request.body
    );
    return reply.code(201).send({ success: true, data });
  }

  async update(request, reply) {
    const data = await this.priceService.updatePrice(
      request.params.clinicId,
      request.params.priceId,
      request.body
    );
    return reply.send({ success: true, data });
  }
}

module.exports = PriceController;
