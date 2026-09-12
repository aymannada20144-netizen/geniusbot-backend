'use strict';

class CampaignController {
  constructor(service) {
    if (!service) throw new TypeError('CampaignController requires service.');
    this.service = service;
  }


  async setMarketingConsent(request, reply) {
    const data = await this.service.setMarketingConsent(
      request.params.clinicId,
      request.params.patientId,
      request.body
    );
    return reply.send({ success: true, data });
  }

  async templates(_request, reply) {
    return reply.send({ success: true, data: this.service.listTemplates() });
  }

  async list(request, reply) {
    const data = await this.service.listCampaigns(request.params.clinicId);
    return reply.send({ success: true, data });
  }

  async preview(request, reply) {
    const data = await this.service.previewAudience(request.params.clinicId, request.body);
    return reply.send({ success: true, data });
  }

  async create(request, reply) {
    const data = await this.service.createCampaign(
      request.params.clinicId,
      request.user.id,
      request.body
    );
    return reply.code(201).send({ success: true, data });
  }

  async update(request, reply) {
    const data = await this.service.updateCampaign(
      request.params.clinicId,
      request.params.campaignId,
      request.body
    );
    return reply.send({ success: true, data });
  }

  async remove(request, reply) {
    const data = await this.service.deleteCampaign(
      request.params.clinicId,
      request.params.campaignId,
      request.user.id
    );
    return reply.send({ success: true, data });
  }

  async send(request, reply) {
    const data = await this.service.sendCampaign(request.params.clinicId, request.params.campaignId);
    return reply.send({ success: true, data });
  }

  async cancel(request, reply) {
    const data = await this.service.cancelCampaign(request.params.clinicId, request.params.campaignId);
    return reply.send({ success: true, data });
  }
}

module.exports = CampaignController;
