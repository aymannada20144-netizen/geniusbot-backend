'use strict';

/** Routes provider receipts by the persisted WAMID owner, never by message text. */
class WhatsAppStatusRouter {
  constructor({ campaignService, appointmentChangeDeliveries, logger = console } = {}) {
    this.campaignService = campaignService;
    this.appointmentChangeDeliveries = appointmentChangeDeliveries;
    this.logger = logger;
  }

  async handle(body) {
    const statuses = extractStatuses(body);
    let handled = 0;
    for (const item of statuses) {
      if (!item?.id || !item?.status) continue;
      const occurredAt = item.timestamp ? new Date(Number(item.timestamp) * 1000) : new Date();
      const errorCode = Array.isArray(item.errors) && item.errors[0]?.code != null
        ? String(item.errors[0].code) : null;
      const campaign = await this.campaignService?.handleOwnedStatus?.(item, occurredAt);
      if (campaign) {
        handled += 1;
        this.#log({ event: 'WHATSAPP_STATUS_ROUTED', owner: 'campaign', wamid: item.id, status: item.status });
        continue;
      }
      const appointment = await this.appointmentChangeDeliveries?.updateProviderStatus?.(
        item.id, item.status, occurredAt, errorCode);
      if (appointment) {
        handled += 1;
        this.#log({ event: 'WHATSAPP_STATUS_ROUTED', owner: 'appointment_change', wamid: item.id, status: item.status });
        continue;
      }
      this.#log({ event: 'WHATSAPP_STATUS_UNTRACKED', wamid: item.id, status: item.status });
    }
    return handled;
  }

  #log(entry) { try { this.logger.info?.(entry); } catch {} }
}

function extractStatuses(body) {
  return Array.isArray(body?.entry) ? body.entry.flatMap((entry) =>
    Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change) =>
    Array.isArray(change?.value?.statuses) ? change.value.statuses : []) : [];
}

module.exports = WhatsAppStatusRouter;
