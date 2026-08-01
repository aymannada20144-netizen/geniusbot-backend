'use strict';

const db = require('../src/db/pool');
const env = require('../src/config/env');
const createRepositories = require('../src/repositories');
const ConversationRepository = require('../src/repositories/ConversationRepository');
const MessageRepository = require('../src/repositories/MessageRepository');
const MasterDataRepository = require('../src/modules/master-data/MasterDataRepository');
const MasterDataService = require('../src/modules/master-data/MasterDataService');
const { create: createAssistantIdentity } = require('../src/modules/assistant-identity');
const createShadenEngine = require('../src/services/shaden/createShadenEngine');
const sendWhatsAppMessage = require('../src/channels/whatsapp/sendWhatsAppMessage');

async function main() {
  const repositories = createRepositories(db);
  const conversationRepository = new ConversationRepository(db);
  const patientResult = await db.query(`
    SELECT id, clinic_id, full_name, coalesce(whatsapp_id, phone_number) AS sender
    FROM geniusbot.patients
    WHERE full_name IN ('منة', 'منه')
      AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 2
  `);
  if (patientResult.rows.length !== 1) {
    throw new Error('Expected exactly one active target patient.');
  }
  const patient = patientResult.rows[0];
  const runtime = createShadenEngine({
    clinicRepository: repositories.clinics,
    patientRepository: repositories.patients,
    conversationRepository,
    messageRepository: new MessageRepository(db),
    catalogService: new MasterDataService(new MasterDataRepository(db)),
    clinicConfigurationSource: createAssistantIdentity(db).service,
    sendMessage: sendWhatsAppMessage,
  });
  const result = await runtime.processMessage({
    channel: 'whatsapp',
    waMessageId: `identity-replay-${Date.now()}`,
    senderPhone: patient.sender,
    receiverPhone: null,
    metaPhoneNumberId: env.whatsapp.phoneNumberId,
    messageType: 'text',
    text: 'هل انتي معي',
    timestamp: new Date().toISOString(),
    rawPayload: { diagnosticReplay: true },
  });
  console.log(JSON.stringify({
    resolvedPatientId: patient.id,
    resolvedPatientFullName: patient.full_name,
    replyText: result.replyText,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
