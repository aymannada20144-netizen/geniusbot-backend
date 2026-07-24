'use strict';

const PatientRepository = require('./PatientRepository');
const PatientService = require('./PatientService');
const PatientController = require('./PatientController');
const registerPatientRoutes = require('./PatientRoutes');
const ConversationRepository = require('../../repositories/ConversationRepository');
const MessageRepository = require('../../repositories/MessageRepository');
const sendWhatsAppMessage = require('../../channels/whatsapp/sendWhatsAppMessage');

const {
  protect,
} = require('../../core/auth');

function register({ app, db }) {
  const patientRepository =
    new PatientRepository(db);

  const patientService =
    new PatientService(patientRepository, {
      conversationRepository: new ConversationRepository(db),
      messageRepository: new MessageRepository(db),
      sendMessage: sendWhatsAppMessage,
    });

  const patientController =
    new PatientController(patientService);

  registerPatientRoutes(
    app,
    patientController,
    protect
  );
}

module.exports = {
  register,
};
