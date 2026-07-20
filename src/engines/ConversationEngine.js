'use strict';

const {
  InternalServerError,
  ValidationError,
} = require('../core/errors');

const ConversationServiceContract = require(
  '../contracts/ConversationServiceContract'
);

const ConversationRepositoryContract = require(
  '../contracts/ConversationRepositoryContract'
);

class ConversationEngine {
  constructor({
    messageNormalizer,
    stateManager,
    conversationRepository,
    contextBuilder,
    messageUnderstandingService,
    bookingConversationService,
    appointmentConversationService,
    inquiryService,
    recoveryService,
    messageRepository,
    messageSender,
    logger = console,
  } = {}) {
    this.messageNormalizer = messageNormalizer;
    this.stateManager = stateManager;
    this.conversationRepository =
      conversationRepository;
    this.contextBuilder = contextBuilder;
    this.messageUnderstandingService =
      messageUnderstandingService;
    this.bookingConversationService =
      bookingConversationService;
    this.appointmentConversationService =
      appointmentConversationService;
    this.inquiryService = inquiryService;
    this.recoveryService = recoveryService;
    this.messageRepository = messageRepository;
    this.messageSender = messageSender;
    this.logger = logger;

    this.validateDependencies();
  }

  async processMessage(rawMessage) {
    let message = null;

    try {
      message =
        this.messageNormalizer.normalize(
          rawMessage
        );

      const conversation =
        await this.loadOrCreateConversation(
          message
        );

      const currentState =
        this.stateManager.normalize(
          conversation.state
        );

      await this.saveIncomingMessage({
        conversation,
        message,
      });

      const contextResult =
        await this.contextBuilder.build({
          message,
          conversation,
          state: currentState,
        });

      const context =
        ConversationServiceContract.assertContext(
          contextResult
        );

      const understandingResult =
        await this.messageUnderstandingService
          .understand({
            message,
            context,
            state: currentState,
          });

      const understanding =
        ConversationServiceContract
          .normalizeUnderstanding(
            understandingResult
          );

      const serviceResult =
        await this.route({
          message,
          conversation,
          context,
          state: currentState,
          understanding,
        });

      const result =
        ConversationServiceContract
          .normalizeServiceResult(
            serviceResult,
            {
              stateManager:
                this.stateManager,
              currentState,
            }
          );

      /*
       * نرسل الرد أولاً.
       *
       * لا يتم تحديث حالة المحادثة ولا تسجيل الرسالة
       * الصادرة إلا بعد نجاح قناة الإرسال.
       *
       * بذلك لا تظهر في قاعدة البيانات رسالة صادرة
       * على أنها نُفذت بينما لم تصل فعلياً إلى العميل.
       */
      const deliveryResult =
        await this.sendResponse({
          message,
          conversation,
          result,
        });

      await this.persistResult({
        conversation,
        message,
        result,
        understanding,
        deliveryResult,
      });

      return result;
    } catch (error) {
      this.logProcessingError({
        error,
        message,
        rawMessage,
      });

      throw error;
    }
  }

  async loadOrCreateConversation(message) {
    const findInput =
      ConversationRepositoryContract
        .assertFindActiveInput({
          channel: message.channel,
          senderId: message.senderId,
          receiverId: message.receiverId,
        });

    const existingConversation =
      await this.conversationRepository
        .findActiveByChannelIdentity(
          findInput
        );

    const validatedExistingConversation =
      ConversationRepositoryContract
        .assertConversation(
          existingConversation,
          {
            nullable: true,
          }
        );

    if (validatedExistingConversation) {
      return ConversationServiceContract
        .assertConversation(
          validatedExistingConversation
        );
    }

    const createInput =
      ConversationRepositoryContract
        .assertCreateInput({
          channel: message.channel,
          senderId: message.senderId,
          receiverId: message.receiverId,
          contactName:
            message.contactName,
          state:
            this.stateManager
              .createInitialState(),
          metadata: message.metadata,
        });

    const createdConversation =
      await this.conversationRepository
        .create(createInput);

    const validatedConversation =
      ConversationRepositoryContract
        .assertConversation(
          createdConversation
        );

    return ConversationServiceContract
      .assertConversation(
        validatedConversation
      );
  }

  async route(input) {
    const intent = this.resolveIntent(
      input
    );

    switch (intent) {
      case 'book_appointment':
        return this.bookingConversationService
          .handle(input);

      case 'cancel_appointment':
      case 'reschedule_appointment':
      case 'appointment_status':
        return this
          .appointmentConversationService
          .handle(input);

      case 'human_handoff':
      case 'recover_booking':
        return this.recoveryService
          .handle(input);

      case 'general_inquiry':
      case 'unknown':
      default:
        return this.inquiryService
          .handle(input);
    }
  }

  resolveIntent({
    state,
    understanding,
  }) {
    if (state?.activeFlow) {
      return this.mapActiveFlowToIntent(
        state.activeFlow
      );
    }

    if (understanding.requiresHuman) {
      return 'human_handoff';
    }

    return understanding.intent;
  }

  mapActiveFlowToIntent(activeFlow) {
    const flowIntentMap = {
      booking: 'book_appointment',

      appointment_management:
        'appointment_status',

      cancellation:
        'cancel_appointment',

      rescheduling:
        'reschedule_appointment',

      recovery:
        'recover_booking',

      handoff:
        'human_handoff',

      inquiry:
        'general_inquiry',
    };

    return (
      flowIntentMap[activeFlow] ||
      'general_inquiry'
    );
  }

  async persistResult({
    conversation,
    message,
    result,
    understanding,
    deliveryResult,
  }) {
    const updateInput =
      ConversationRepositoryContract
        .assertUpdateStateInput({
          conversationId:
            conversation.id,

          state: result.state,

          lastIntent:
            understanding.intent,

          status:
            result.state.status,

          patientId:
            result.state
              .collectedData
              ?.patientId,
        });

    await this.conversationRepository
      .updateState(updateInput);

    await this.saveOutgoingMessage({
      conversation,
      message,
      result,
      understanding,
      deliveryResult,
    });
  }

  async saveOutgoingMessage({
    conversation,
    message,
    result,
    understanding,
    deliveryResult,
  }) {
    return this.messageRepository.create({
      conversationId:
        conversation.id,

      direction: 'outbound',

      channel: message.channel,

      messageType: 'text',

      text: result.replyText,

      metadata: {
        ...result.metadata,

        intent:
          understanding.intent,

        confidence:
          understanding.confidence,

        action:
          result.action,

        actionResult:
          result.actionResult,

        /*
         * لا نفترض بنية محددة لرد قناة الإرسال.
         * يتم الاحتفاظ بالنتيجة كما أعادها MessageSender.
         */
        delivery:
          deliveryResult ?? null,
      },
    });
  }

  async saveIncomingMessage({
    conversation,
    message,
  }) {
    return this.messageRepository.create({
      conversationId:
        conversation.id,

      externalMessageId:
        message.externalMessageId,

      direction: 'inbound',

      channel: message.channel,

      messageType:
        message.messageType,

      text: message.text,

      media: message.media,

      metadata: message.metadata,

      rawPayload:
        message.rawPayload,

      receivedAt:
        message.receivedAt,
    });
  }

  async sendResponse({
    message,
    conversation,
    result,
  }) {
    return this.messageSender.sendText({
      channel: message.channel,

      recipientId:
        message.senderId,

      senderId:
        message.receiverId,

      text:
        result.replyText,

      conversationId:
        conversation.id,

      metadata:
        result.metadata,
    });
  }

  validateDependencies() {
    const requiredDependencies = [
      'messageNormalizer',
      'stateManager',
      'conversationRepository',
      'contextBuilder',
      'messageUnderstandingService',
      'bookingConversationService',
      'appointmentConversationService',
      'inquiryService',
      'recoveryService',
      'messageRepository',
      'messageSender',
    ];

    for (
      const dependencyName
      of requiredDependencies
    ) {
      if (!this[dependencyName]) {
        throw new ValidationError(
          `${dependencyName} dependency is required.`
        );
      }
    }

    this.requireMethod(
      this.messageNormalizer,
      'normalize',
      'messageNormalizer'
    );

    this.requireMethod(
      this.stateManager,
      'normalize',
      'stateManager'
    );

    this.requireMethod(
      this.stateManager,
      'createInitialState',
      'stateManager'
    );

    ConversationRepositoryContract
      .assertImplementation(
        this.conversationRepository
      );

    this.requireMethod(
      this.contextBuilder,
      'build',
      'contextBuilder'
    );

    this.requireMethod(
      this.messageUnderstandingService,
      'understand',
      'messageUnderstandingService'
    );

    this.requireMethod(
      this.bookingConversationService,
      'handle',
      'bookingConversationService'
    );

    this.requireMethod(
      this.appointmentConversationService,
      'handle',
      'appointmentConversationService'
    );

    this.requireMethod(
      this.inquiryService,
      'handle',
      'inquiryService'
    );

    this.requireMethod(
      this.recoveryService,
      'handle',
      'recoveryService'
    );

    this.requireMethod(
      this.messageRepository,
      'create',
      'messageRepository'
    );

    this.requireMethod(
      this.messageSender,
      'sendText',
      'messageSender'
    );

    if (
      !this.logger ||
      typeof this.logger !== 'object'
    ) {
      throw new ValidationError(
        'logger must be a valid object.'
      );
    }
  }

  requireMethod(
    target,
    methodName,
    dependencyName
  ) {
    if (
      typeof target?.[methodName] !==
      'function'
    ) {
      throw new ValidationError(
        `${dependencyName}.${methodName} must be a function.`
      );
    }
  }

  logProcessingError({
    error,
    message,
    rawMessage,
  }) {
    const loggerMethod =
      typeof this.logger.error ===
      'function'
        ? this.logger.error.bind(
            this.logger
          )
        : console.error;

    loggerMethod(
      'ConversationEngine failed to process message.',
      {
        errorName:
          error?.name ||
          InternalServerError.name,

        errorMessage:
          error?.message ||
          'Unknown conversation error.',

        externalMessageId:
          message?.externalMessageId ||
          rawMessage
            ?.externalMessageId ||
          rawMessage
            ?.waMessageId ||
          null,

        channel:
          message?.channel ||
          rawMessage?.channel ||
          null,

        senderId:
          message?.senderId ||
          rawMessage?.senderId ||
          rawMessage?.senderPhone ||
          null,
      }
    );
  }
}

module.exports = ConversationEngine;