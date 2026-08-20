'use strict';

const ShadenPolicy = require('./ShadenPolicy');
const {
  extractBookingReference,
  isAppointmentManagementCancellation,
} = require('./ShadenIntentResolver');
const {
  parsePreferredStart: parseBookingPreferredStart,
  DEFAULT_TIME_ZONE,
} = require('./BookingDateTimeParser');
const {
  lifecycleMetadataFrom,
} = require('../../contracts/shaden/InternalHandlerResult');

class ShadenEngine {
  constructor({
    policy = new ShadenPolicy(),
    bookingEngine = null,
    appointmentService = null,
    priceService = null,
    clock = null,
  } = {}) {
    this.policy = policy;
    this.bookingEngine = bookingEngine;
    this.appointmentService = appointmentService;
    this.priceService = priceService;
    this.clock = clock && typeof clock.now === 'function'
      ? clock
      : { now: () => new Date() };
  }

  handle({
    message,
    dialogueDecision = null,
    clinicDomainRead = null,
    currentState,
    clinicData,
    bookingContext = null,
    patientIdentity = null,
  }) {
    const nextState = normalizeState(currentState, this.policy);
    const canonicalCustomerName = patientIdentity?.patient
      ? patientIdentity.customerName
      : null;
    const customerName = canonicalCustomerName || nextState.customer.name;
    const text = message?.text ?? message;
    const interactiveReplyId = message && typeof message === 'object'
      ? message.rawPayload?.value
      : null;
    let inquiry = this.policy.recognize(text);

    if (inquiry.type === 'unknown' && !interactiveReplyId) {
      inquiry = inquiryForDialogueDecision(dialogueDecision) || inquiry;
    }

    if (isCurrentChangeServiceInteractiveReply(nextState.changeService, interactiveReplyId)) {
      inquiry = { type: 'unknown' };
    }
    if (isCurrentChangeBranchInteractiveReply(nextState.changeBranch, interactiveReplyId)) {
      inquiry = { type: 'unknown' };
    }

    if (
      nextState.context?.inquiry === 'appointment_management_clarification' &&
      interactiveReplyId === 'management-clarify:cancel'
    ) {
      inquiry = { type: 'booking_cancellation_request' };
      nextState.context = null;
    } else if (
      nextState.context?.inquiry === 'appointment_management_clarification' &&
      interactiveReplyId === 'management-clarify:reschedule'
    ) {
      inquiry = { type: 'booking_modification_request' };
      nextState.context = null;
    } else if (
      nextState.context?.inquiry === 'change_service_request' &&
      interactiveReplyId === 'change-service:new-booking'
    ) {
      inquiry = { type: 'booking', serviceText: null };
      nextState.context = null;
    } else if (
      nextState.context?.inquiry === 'change_service_request' &&
      interactiveReplyId === 'change-service:cancel-current'
    ) {
      inquiry = { type: 'booking_cancellation_request' };
      nextState.context = null;
    }

    interruptAppointmentManagementFlow(nextState, inquiry, interactiveReplyId);

    // Availability remains a distinct resolver intent, while the current safe
    // runtime reuses booking discovery until a dedicated availability handler exists.
    if (inquiry.type === 'availability_request') {
      inquiry = { ...inquiry, type: 'booking', serviceText: null };
    }

    if (inquiry.type === 'appointment_management_clarification') {
      nextState.context = { inquiry: 'appointment_management_clarification' };
      return legacyEngineResult({
        reply: this.policy.appointmentManagementClarification(),
        interaction: {
          version: 1,
          mode: 'reply_buttons',
          purpose: 'clarify_appointment_management',
          displayText: this.policy.appointmentManagementClarification(),
          options: [
            { id: 'management-clarify:cancel', label: 'إلغاء الموعد' },
            { id: 'management-clarify:reschedule', label: 'تغيير الموعد' },
          ],
        },
        nextState,
      });
    }

    if (
      nextState.booking &&
      inquiry.type === 'booking_cancellation_request' &&
      isAppointmentManagementCancellation(text)
    ) {
      delete nextState.booking;
      nextState.step = null;
      nextState.options = [];
      nextState.context = null;
    }

    if (nextState.booking && inquiry.type === 'booking_modification_request') {
      delete nextState.booking;
      nextState.step = null;
      nextState.options = [];
      nextState.context = null;
    }

    // ✅ تفعيل السياق: فهم أسئلة المتابعة القصيرة قبل أي شيء آخر
    if (text.length < 25) {
      // 1. "في كل الفروع؟" بعد سؤال عن العطلة
      if (nextState.context?.inquiry === 'holiday_day' && /(في كل|بالكل|كل الفروع|الكل|كلهن|كلهم)/.test(text)) {
        inquiry = { type: 'context_holiday_all' };
      } 
      // 2. متابعة سؤال التأمين (مثل: "ميد جلف" أو "وميدجالف" أو "طيب بوبا")
      else if (inquiry.type === 'unknown' && (nextState.context?.inquiry === 'insurance_company_check' || nextState.context?.inquiry === 'insurance_companies')) {
        // إزالة كلمات الربط والسياق لتبقى اسم الشركة فقط
        const cleanFollowup = text.replace(/^(طيب|ولا|و|هل|اها|ايوا|نعم|لا|حتى|ما|عن|او|عندكم|لديكم|شركة|شركه|معتمده|معتمد)\s*/, '').trim();
        // إذا تبقى نص، نعتبره اسم شركة ونبحث عنه
        if (cleanFollowup.length > 1) {
          inquiry = { type: 'insurance_company_check', companyName: cleanFollowup };
        }
      }
    }

    const safeData = {
      clinic: clinicData?.clinic || { name: 'العيادة' },
      assistantIdentity: clinicData?.assistantIdentity || {
        name: 'شادن',
        gender: 'female',
      },
      branches: clinicData?.branches || [],
      specialties: clinicData?.specialties || [],
      services: clinicData?.services || [],
      paymentMethods: clinicData?.paymentMethods || [],
      insuranceCompanies: clinicData?.insuranceCompanies || [],
      insuranceClasses: clinicData?.insuranceClasses || [],
      workingHours: clinicData?.workingHours || [],
      serviceBranchCompatibilityAvailable:
        clinicData?.serviceBranchCompatibilityAvailable === true,
      serviceBranchAssignments:
        clinicData?.serviceBranchAssignments || [],
    };

    const knownPatientId = patientIdentity?.patient?.id || null;
    if (
      inquiry.type === 'change_branch_request' ||
      nextState.changeBranch
    ) {
      return handleChangeBranch({
        text, interactiveReplyId, inquiry, state: nextState,
        policy: this.policy, appointmentService: this.appointmentService,
        bookingEngine: this.bookingEngine, clinicId: bookingContext?.clinicId,
        patientId: knownPatientId, conversationId: bookingContext?.conversationId,
        branches: safeData.branches, now: this.clock.now(),
      }).then((result) => normalizeFlowReply(result, nextState, 'changeBranch'));
    }
    if (
      inquiry.type === 'change_service_request' ||
      nextState.changeService
    ) {
      return handleChangeService({
        text, interactiveReplyId, inquiry, state: nextState,
        policy: this.policy, appointmentService: this.appointmentService,
        bookingEngine: this.bookingEngine, clinicId: bookingContext?.clinicId,
        patientId: knownPatientId, conversationId: bookingContext?.conversationId,
        services: safeData.services, now: this.clock.now(),
      }).then((result) => normalizeFlowReply(result, nextState, 'changeService'));
    }
    if (
      !nextState.booking &&
      (inquiry.type === 'booking_modification_request' || nextState.reschedule)
    ) {
      return handleAppointmentReschedule({
        text,
        interactiveReplyId,
        inquiry,
        state: nextState,
        policy: this.policy,
        appointmentService: this.appointmentService,
        bookingEngine: this.bookingEngine,
        clinicId: bookingContext?.clinicId,
        patientId: knownPatientId,
        conversationId: bookingContext?.conversationId,
        now: this.clock.now(),
      }).then((result) => normalizeFlowReply(result, nextState, 'reschedule'));
    }
    if (
      !nextState.booking &&
      (
        inquiry.type === 'booking_cancellation_request' ||
        nextState.cancellation
      )
    ) {
      const handler = knownPatientId
        ? handleKnownPhoneCancellation({
          text,
          interactiveReplyId,
          inquiry,
          state: nextState,
          policy: this.policy,
          appointmentService: this.appointmentService,
          clinicId: bookingContext?.clinicId,
          patientId: knownPatientId,
          conversationId: bookingContext?.conversationId,
        })
        : handleUnknownPhoneCancellation({
          text,
          interactiveReplyId,
          inquiry,
          state: nextState,
          policy: this.policy,
          appointmentService: this.appointmentService,
          clinicId: bookingContext?.clinicId,
          conversationId: bookingContext?.conversationId,
        });
      return handler.then((result) =>
        normalizeFlowReply(result, nextState, 'cancellation')
      );
    }

    const priceText = normalizePriceKeyboardInput(
      text,
      safeData.services,
      this.policy
    );
    if (nextState.priceInquiry || isPriceInquiry(priceText, this.policy)) {
      return handlePriceInquiry({
        text: priceText,
        state: nextState,
        data: safeData,
        policy: this.policy,
        priceService: this.priceService,
        now: this.clock.now(),
        bookingContext,
      }).then((result) => normalizeLegacyReply(result, nextState));
    }

    if (canonicalCustomerName && nextState.step === 'customer_name') {
      nextState.step = null;
    } else if (nextState.step === 'customer_name') {
      const name = this.policy.extractCustomerName(text);
      if (name) {
        nextState.customer.name = name;
        nextState.step = null;
        nextState.context = null;
        if (nextState.booking) {
          const choice = bookingServiceChoiceReply(
            this.policy.bookingNameCaptured(
              name,
              compatibleBookableServices(safeData),
              safeData.clinic
            ),
            nextState.booking,
            safeData,
            this.policy
          );
          return normalizeFlowReply(choice, nextState, 'booking');
        }
        return legacyEngineResult({ reply: this.policy.nameCaptured(name), nextState });
      }
    }

    if (inquiry.type === 'booking' && !nextState.booking) {
      nextState.booking = emptyBookingState();
      try {
        const initialPreference = parseBookingPreferredStart(text, null, this.policy, {
          timeZone: DEFAULT_TIME_ZONE,
          now: this.clock.now(),
        });
        if (initialPreference.partial || initialPreference.complete) {
          nextState.booking.preferredStart = initialPreference.value;
        }
      } catch (error) {
        // The booking request remains valid when its optional date text cannot be parsed.
      }
      nextState.context = null;
      if (!customerName) {
        nextState.step = 'customer_name';
        return normalizeFlowReply({
          reply: this.policy.bookingCustomerName(),
        }, nextState, 'booking');
      }
      const choice = bookingServiceChoiceReply(
        null,
        nextState.booking,
        safeData,
        this.policy
      );
      return normalizeFlowReply(choice, nextState, 'booking');
    }

    if (nextState.booking) {
      const bookingReply = handleBookingStep({
        text,
        interactiveReplyId,
        inquiry,
        data: safeData,
        state: nextState,
        policy: this.policy,
        replyFor: this.replyFor.bind(this),
        bookingEngine: this.bookingEngine,
        bookingContext,
        customerName,
        now: this.clock.now(),
      });
      if (bookingReply) {
        if (typeof bookingReply.then === 'function') {
          return bookingReply.then((result) =>
            normalizeFlowReply(result, nextState, 'booking')
          );
        }
        return normalizeFlowReply(bookingReply, nextState, 'booking');
      }
    }

    if (inquiry.type === 'change_service_request') {
      nextState.context = { inquiry: 'change_service_request' };
      const reply = this.policy.changeServiceUnsupported();
      return legacyEngineResult({
        reply,
        interaction: {
          version: 1,
          mode: 'reply_buttons',
          purpose: 'change_service_fallback',
          displayText: reply,
          options: [
            { id: 'change-service:new-booking', label: 'حجز موعد جديد' },
            { id: 'change-service:cancel-current', label: 'إلغاء الموعد الحالي' },
          ],
        },
        nextState,
      });
    }

    let reply;
    try {
      reply = this.replyFor(inquiry, safeData, customerName, clinicDomainRead);
    } catch (error) {
      console.error('❌ Error generating reply:', error);
      reply = this.policy.unknown();
    }

    applySocialState(nextState, inquiry);
    return legacyEngineResult({ reply, nextState });
  }

  replyFor(inquiry, data, customerName, clinicDomainRead = null) {
    if (!inquiry || !inquiry.type) return this.policy.unknown();

    switch (inquiry.type) {
      case 'combined_greeting': return this.policy.combinedGreeting(customerName);
      case 'greeting': return this.policy.greeting(inquiry.kind, customerName);
      case 'presence': return this.policy.presence(customerName, data.assistantIdentity);
      case 'identity': return this.policy.identity(data.clinic.name, customerName, data.assistantIdentity);
      case 'courtesy': return this.policy.courtesy(inquiry.kind, customerName);
      case 'farewell': return this.policy.farewell(customerName);
      case 'acknowledgement': return this.policy.acknowledgement(customerName);
      case 'how_are_you': return this.policy.howAreYou(customerName);
      case 'booking_modification_request':
        return this.policy.appointmentRescheduleRequested();
      case 'cancellation_information_request':
        return this.policy.cancellationInformationUnavailable();
      case 'change_service_request':
        return this.policy.changeServiceUnsupported();
      case 'change_branch_request':
        return this.policy.changeBranchUnsupported();
      case 'change_provider_request':
        return this.policy.changeProviderUnsupported();

      case 'branches':
        if (clinicDomainRead?.ownership === 'authoritative') {
          if (clinicDomainRead.outcome === 'CLARIFY') return this.policy.unknown();
          if (clinicDomainRead.outcome === 'ERROR') return this.policy.medicalKnowledgeUnavailable();
          if (clinicDomainRead.outcome === 'ZERO_MATCHES') return this.policy.bookingServiceNotOffered();
          return this.policy.branches(clinicDomainRead.branches);
        }
        if (inquiry.city) {
          const branchesInCity = data.branches.filter(
            b => this.policy.normalize(b.city) === this.policy.normalize(inquiry.city)
          );
          if (branchesInCity.length > 0) return `نعم، لدينا ${branchesInCity.length} فروع في ${this.policy.display(inquiry.city)}:\n${this.policy.branches(branchesInCity)}`;
          return this.policy.noActiveBranches(inquiry.city);
        }
        return this.policy.branches(data.branches);

      case 'specialties': return this.policy.specialties(data.specialties, data.clinic);
      case 'services':
        if (clinicDomainRead?.ownership === 'authoritative') {
          if (clinicDomainRead.outcome === 'CLARIFY') return this.policy.unknown();
          if (clinicDomainRead.outcome === 'ERROR') return this.policy.medicalKnowledgeUnavailable();
          if (clinicDomainRead.outcome === 'ZERO_MATCHES') return this.policy.bookingServiceNotOffered();
          return this.policy.services(clinicDomainRead.services, data.clinic);
        }
        return this.policy.services(data.services, data.clinic);
      case 'services_under_specialty':
        if (clinicDomainRead?.ownership === 'authoritative') {
          if (clinicDomainRead.outcome === 'CLARIFY') return this.policy.unknown();
          if (clinicDomainRead.outcome === 'ERROR') return this.policy.medicalKnowledgeUnavailable();
          if (clinicDomainRead.outcome === 'ZERO_MATCHES') return this.policy.bookingServiceNotOffered();
          return this.policy.services(clinicDomainRead.services, data.clinic);
        }
        const cleanSpec = this.policy.normalize(inquiry.specialtyText).replace(/ال/g, '').replace(/\s/g, '');
        const filteredServices = data.services.filter(s => {
          const cleanServiceName = this.policy.normalize(s.name).replace(/ال/g, '').replace(/\s/g, '');
          return cleanServiceName.includes(cleanSpec);
        });
        if (filteredServices.length > 0) return this.policy.services(filteredServices, data.clinic);
        let specExists = findExactService(inquiry.specialtyText, data.specialties, this.policy);
        if (specExists) return `نعم، تخصص ${this.policy.display(specExists.name)} متوفر لدينا، لكن لا توجد خدمات مفصلة مسجلة تحته حالياً. 🌸`;
        return this.policy.serviceExists(null);

            case 'service_exists':
        // ✅ منع اعتبار أسماء الشركات كخدمات طبية
        const serviceKeywords = /^(كشف|قسم|علاج|حجز|عملية|ليزر|تنظيف|تقشير|شد|حقن|فيلر|بوتوكس|استشاره|استشارة|اطفال|اسنان|جلديه|تجميل)/;
        if (!serviceKeywords.test(this.policy.normalize(inquiry.value))) {
          // إذا لم تكن كلمة طبية، اتركها لتسقط في الـ Unknown (حيث سيلتقطها سياق التأمين)
          return this.policy.unknown();
        }

        let foundService = findExactService(inquiry.value, data.services, this.policy);
        if (foundService) return this.policy.serviceExists(foundService);
        let foundSpecialty = findExactService(inquiry.value, data.specialties, this.policy);
        if (foundSpecialty) return `نعم، تخصص ${this.policy.display(foundSpecialty.name)} متوفر لدينا.`;
        return this.policy.serviceExists(null);

      case 'payment_methods': return this.policy.paymentMethods(data.paymentMethods);
      case 'insurance_companies': return this.policy.insuranceCompanies(data.insuranceCompanies);
      case 'insurance_classes': return this.policy.insuranceClasses(data.insuranceClasses.filter(item => item.isAccepted));
      case 'insurance_class_check': return this.policy.insuranceClassStatus(findInsuranceClass(inquiry.value, data.insuranceClasses, this.policy), inquiry.value);

      // ✅ الرد على سؤال السياق لشركات التأمين
      case 'insurance_company_check':
        const cleanCompanyName = this.policy.normalize(inquiry.companyName);
        const matchedCompany = data.insuranceCompanies.find(c => {
          const dbName = this.policy.normalize(c.name);
          return dbName === cleanCompanyName || dbName.includes(cleanCompanyName) || cleanCompanyName.includes(dbName);
        });

        if (matchedCompany) {
          return `نعم، شركة ${this.policy.display(matchedCompany.name)} معتمدة لدينا. 🌸`;
        }
        return `عذراً، شركة ${this.policy.display(inquiry.companyName)} ليست من شركات التأمين المعتمدة لدينا حالياً. 🌸`;

      case 'working_hours': return this.policy.allWorkingHours(data);
      case 'working_hours_city': return this.policy.allWorkingHours(data, inquiry.city);
      case 'working_hours_branch':
        const branch = findBranch(inquiry.branchText, data, this.policy);
        if (!branch) {
          const city = extractCity(inquiry.branchText);
          if (city) return this.policy.noActiveBranches(city);
          return 'الفرع المذكور غير مسجل لدينا. 🌸';
        }
        return workingBranchReply(inquiry, data, this.policy);
      case 'working_day': return workingDayReply(inquiry, data, this.policy);

      case 'branch_address': return this.policy.branchAddress(inquiry.branchText ? findBranch(inquiry.branchText, data, this.policy) : (data.branches[0] || null));
      case 'holiday_day': return this.policy.holidayDay(data);
      case 'empathy': return this.policy.empathy();
      case 'context_holiday_all': return "نعم، الإجازة تشمل جميع الفروع حاليًا 🌸";

      case 'booking': return this.policy.bookingChooseService(data.services, data.clinic);
      default: return this.policy.unknown();
    }
  }
}

async function handleAppointmentReschedule({
  text, interactiveReplyId, inquiry, state, policy, appointmentService,
  bookingEngine, clinicId, patientId, conversationId, now,
}) {
  if (!appointmentService || !bookingEngine || !clinicId) {
    clearRescheduleState(state);
    return policy.rescheduleUnavailable();
  }
  if (inquiry.type === 'booking_modification_request') {
    clearCancellationState(state);
    state.reschedule = createRescheduleState({
      bookingReference: inquiry.bookingReference || null,
      verificationRequired: !patientId,
      dateTimeExpressions: inquiry.dateTimeExpressions || [],
    });
    if (!patientId) return policy.rescheduleAskBookingReference();
    let candidates = await loadRescheduleCandidates({
      appointmentService, clinicId, patientId,
    });
    if (inquiry.bookingReference) {
      const resolved = await appointmentService
        .resolveAppointmentForManagementByBookingReference(
          clinicId, inquiry.bookingReference
        );
      if (!resolved || resolved.patientId !== patientId || resolved.clinicId !== clinicId) {
        return resetUnavailableReschedule(state, policy);
      }
      candidates = candidates.filter(({ id }) => id === resolved.appointmentId);
    }
    if (candidates.length === 1) {
      state.reschedule.candidateAppointmentIds = [candidates[0].id];
      state.reschedule.selectedAppointmentId = candidates[0].id;
      state.reschedule.bookingReference = candidates[0].booking_reference || null;
      state.reschedule.ownershipVerified = true;
      return loadRescheduleDates({
        selected: candidates[0], state, policy, bookingEngine, clinicId, now,
      });
    }
    return beginRescheduleSelection(candidates, state, policy);
  }

  const flow = state.reschedule;
  if (!flow) return policy.rescheduleUnavailable();
  if (isCancellationAbandonment(text, policy)) {
    clearRescheduleState(state);
    return policy.rescheduleDeclined();
  }

  if (flow.step === 'awaiting_reference') {
    flow.bookingReference = extractBookingReference(text);
    flow.step = 'awaiting_verification';
    return policy.rescheduleAskRegisteredMobile();
  }
  if (flow.step === 'awaiting_verification') {
    const verification = await appointmentService.verifyAppointmentOwnership(
      clinicId, flow.bookingReference, text
    );
    if (!verification?.verified) {
      flow.verificationAttempts += 1;
      if (flow.verificationAttempts >= 3) {
        clearRescheduleState(state);
        return policy.rescheduleVerificationExhausted();
      }
      return policy.rescheduleVerificationFailed();
    }
    const candidates = await loadRescheduleCandidates({
      appointmentService, clinicId, patientId: verification.patientId,
    });
    const selected = candidates.find(({ id }) => id === verification.appointmentId);
    if (!selected) {
      clearRescheduleState(state);
      return policy.rescheduleUnavailable();
    }
    flow.ownershipVerified = true;
    flow.candidateAppointmentIds = [selected.id];
    flow.selectedAppointmentId = selected.id;
    flow.bookingReference = selected.booking_reference || flow.bookingReference;
    return loadRescheduleDates({ selected, state, policy, bookingEngine, clinicId, now });
  }
  if (flow.step === 'awaiting_selection') {
    const index = parseManagementSelection(
      text, interactiveReplyId, flow.candidateAppointmentIds,
      'reschedule-appointment:', policy
    );
    if (index === null) return policy.rescheduleInvalidSelection(flow.candidateAppointmentIds.length);
    const candidates = await loadRescheduleCandidates({ appointmentService, clinicId, patientId });
    const selected = candidates.find(({ id }) => id === flow.candidateAppointmentIds[index]);
    if (!selected) {
      clearRescheduleState(state);
      return policy.rescheduleUnavailable();
    }
    flow.selectedAppointmentId = selected.id;
    flow.bookingReference = selected.booking_reference || null;
    flow.ownershipVerified = true;
    return loadRescheduleDates({ selected, state, policy, bookingEngine, clinicId, now });
  }
  if (flow.step === 'awaiting_date') {
    const date = parseOptionChoice(text, interactiveReplyId, flow.availableDates, 'reschedule-date:', policy);
    if (!date) return policy.rescheduleInvalidDate();
    flow.selectedDate = date;
    const candidate = await reloadRescheduleCandidate({ appointmentService, clinicId, patientId, flow });
    if (!candidate) return resetUnavailableReschedule(state, policy);
    const result = await bookingEngine.getAvailableTimes({
      clinicId, service: { id: candidate.service_id }, branch: { id: candidate.branch_id },
      doctor: candidate.doctor_id ? { id: candidate.doctor_id } : null,
      room: candidate.room_id ? { id: candidate.room_id } : null,
      date, excludeAppointmentId: candidate.id,
    });
    flow.availableTimes = result.times || [];
    flow.step = 'awaiting_time';
    return interactionOptions(policy.rescheduleChooseTime(), 'select_reschedule_time',
      flow.availableTimes, 'reschedule-time:', formatArabicRescheduleTime);
  }
  if (flow.step === 'awaiting_time') {
    const time = parseOptionChoice(text, interactiveReplyId, flow.availableTimes, 'reschedule-time:', policy);
    if (!time) return policy.rescheduleInvalidTime();
    flow.selectedTime = time;
    flow.step = 'awaiting_confirmation';
    flow.confirmationPending = true;
    const candidate = await reloadRescheduleCandidate({
      appointmentService, clinicId, patientId, flow,
    });
    if (!candidate) return resetUnavailableReschedule(state, policy);
    return {
      reply: policy.rescheduleReview({
        bookingReference: candidate.booking_reference,
        previousStart: candidate.appointment_start,
        newDate: flow.selectedDate,
        newTime: flow.selectedTime,
      }),
      interaction: {
        version: 1,
        mode: 'reply_buttons',
        purpose: 'confirm_appointment_reschedule',
        displayText: 'تأكيد تغيير الموعد؟',
        options: [
          { id: 'reschedule-confirm:yes', label: 'تأكيد تغيير الموعد' },
          { id: 'reschedule-confirm:keep', label: 'الاحتفاظ بالموعد' },
        ],
      },
    };
  }
  if (flow.step === 'awaiting_confirmation') {
    const normalized = interactiveReplyId === 'reschedule-confirm:yes'
      ? 'نعم' : interactiveReplyId === 'reschedule-confirm:keep' ? 'لا' : policy.normalize(text);
    if (['لا', 'تراجع', 'الغاء'].includes(normalized)) {
      clearRescheduleState(state);
      return policy.rescheduleDeclined();
    }
    if (!['نعم', 'اوافق', 'تاكيد', 'اكد'].includes(normalized)) {
      return policy.rescheduleAskConfirmation();
    }
    const candidate = await reloadRescheduleCandidate({ appointmentService, clinicId, patientId, flow });
    if (!candidate) return resetUnavailableReschedule(state, policy);
    try {
      const parsed = parseBookingPreferredStart(
        `${flow.selectedDate} ${flow.selectedTime}`, null, policy,
        { timeZone: DEFAULT_TIME_ZONE, now }
      );
      if (!parsed.complete || !parsed.value) return policy.rescheduleInvalidTime();
      const start = new Date(parsed.value);
      const duration = new Date(candidate.appointment_end) - new Date(candidate.appointment_start);
      const result = await appointmentService.rescheduleAppointment(
        clinicId, candidate.id, start.toISOString(),
        new Date(start.getTime() + duration).toISOString(), null,
        { patientId: patientId || (await resolveRescheduleOwner(appointmentService, clinicId, flow))?.patientId,
          source: 'shaden', ...(conversationId ? { conversationId } : {}) }
      );
      clearRescheduleState(state);
      if (result?.communication?.attempted === true) {
        return {
          reply: result.communication.success === false
            ? policy.rescheduleNotificationPending()
            : null,
          notificationAttempted: true,
          lifecycleTerminalReason: 'completed',
        };
      }
      return {
        reply: policy.rescheduleSuccessful(result),
        lifecycleTerminalReason: 'completed',
      };
    } catch (error) {
      clearRescheduleState(state);
      return String(error?.code || '').includes('SLOT') || error?.name === 'ConflictError'
        ? policy.rescheduleSlotUnavailable()
        : policy.rescheduleExecutionFailed();
    }
  }
  return resetUnavailableReschedule(state, policy);
}

async function handleChangeBranch({
  text, interactiveReplyId, inquiry, state, policy, appointmentService,
  bookingEngine, clinicId, patientId, conversationId, branches, now,
}) {
  if (!appointmentService || !bookingEngine || !clinicId) {
    clearChangeBranchState(state);
    return policy.changeBranchUnavailable();
  }
  if (inquiry.type === 'change_branch_request') {
    clearCancellationState(state);
    clearRescheduleState(state);
    clearChangeServiceState(state);
    state.changeBranch = createChangeBranchState({
      verificationRequired: !patientId,
      targetBranchId: resolveTargetBranchHint(text, branches, policy)?.id || null,
    });
    if (!patientId) return policy.changeBranchAskBookingReference();
    const candidates = (await loadKnownPatientCandidates({ appointmentService, clinicId, patientId }))
      .filter(({ status }) => ['pending', 'confirmed'].includes(status));
    return beginChangeBranchAppointmentSelection(
      candidates, state, policy, branches, appointmentService, bookingEngine,
      clinicId, patientId, now
    );
  }
  const flow = state.changeBranch;
  if (!flow) return policy.changeBranchUnavailable();
  if (isCancellationAbandonment(text, policy)) {
    clearChangeBranchState(state);
    return policy.changeBranchDeclined();
  }
  if (flow.step === 'awaiting_reference') {
    const reference = extractBookingReference(text);
    if (!reference) return policy.changeBranchAskBookingReference();
    flow.bookingReference = reference;
    flow.step = 'awaiting_verification';
    return policy.changeBranchAskRegisteredMobile();
  }
  if (flow.step === 'awaiting_verification') {
    const verified = await appointmentService.verifyAppointmentOwnership(
      clinicId, flow.bookingReference, text
    );
    if (!verified?.verified) {
      flow.verificationAttempts += 1;
      if (flow.verificationAttempts >= 3) {
        clearChangeBranchState(state);
        return policy.changeBranchVerificationExhausted();
      }
      return policy.changeBranchVerificationFailed();
    }
    const candidates = (await loadKnownPatientCandidates({
      appointmentService, clinicId, patientId: verified.patientId,
    })).filter(({ id, status }) =>
      id === verified.appointmentId && ['pending', 'confirmed'].includes(status)
    );
    flow.ownershipVerified = true;
    return beginChangeBranchAppointmentSelection(
      candidates, state, policy, branches, appointmentService, bookingEngine,
      clinicId, verified.patientId, now
    );
  }
  if (flow.step === 'awaiting_appointment') {
    const index = parseManagementSelection(
      text, interactiveReplyId, flow.candidateAppointmentIds,
      'change-branch-appointment:', policy
    );
    if (index === null) return policy.changeBranchInvalidSelection();
    flow.selectedAppointmentId = flow.candidateAppointmentIds[index];
    const candidate = await changeBranchCandidate(appointmentService, clinicId, patientId, flow);
    if (!candidate) return terminalChangeBranchFailure(state, policy);
    flow.bookingReference = candidate.booking_reference || flow.bookingReference;
    return continueWithTargetBranchHint(
      flow, state, policy, branches, candidate, appointmentService, clinicId,
      patientId || candidate.patient_id, bookingEngine, now
    );
  }
  if (flow.step === 'awaiting_branch') {
    const branch = selectChangeBranch(text, interactiveReplyId, branches, flow, policy);
    if (!branch) return policy.changeBranchInvalidSelection();
    const ownerId = patientId || (await appointmentService
      .resolveAppointmentForManagementByBookingReference(clinicId, flow.bookingReference))?.patientId;
    return advanceChangeBranchTarget({
      branch, flow, state, policy, appointmentService, bookingEngine,
      clinicId, patientId: ownerId, now,
    });
  }
  if (flow.step === 'awaiting_date') {
    const date = parseOptionChoice(text, interactiveReplyId, flow.availableDates,
      'change-branch-date:', policy);
    if (!date) return policy.changeBranchInvalidDate();
    flow.proposedDate = date;
    const candidate = await changeBranchCandidate(appointmentService, clinicId, patientId, flow);
    if (!candidate) return terminalChangeBranchFailure(state, policy);
    const times = await bookingEngine.getAvailableTimes({
      clinicId, service: { id: candidate.service_id },
      branch: { id: flow.targetBranchId }, date,
      excludeAppointmentId: candidate.id,
    });
    flow.availableTimes = times.times || [];
    flow.step = 'awaiting_time';
    return interactionOptions(policy.changeBranchChooseTime(), 'select_change_branch_time',
      flow.availableTimes, 'change-branch-time:', formatArabicRescheduleTime);
  }
  if (flow.step === 'awaiting_time') {
    const time = parseOptionChoice(text, interactiveReplyId, flow.availableTimes,
      'change-branch-time:', policy);
    if (!time) return policy.changeBranchInvalidTime();
    const candidate = await changeBranchCandidate(appointmentService, clinicId, patientId, flow);
    if (!candidate) return terminalChangeBranchFailure(state, policy);
    const parsed = parseBookingPreferredStart(`${flow.proposedDate} ${time}`, null, policy,
      { timeZone: DEFAULT_TIME_ZONE, now });
    if (!parsed.complete) return policy.changeBranchInvalidTime();
    flow.proposedStart = parsed.value;
    try {
      const proposal = await appointmentService.previewBranchChange(
        clinicId, candidate.id, flow.targetBranchId, flow.proposedStart,
        patientId || candidate.patient_id
      );
      if (proposal.requiresNewSlot) return policy.changeBranchSlotUnavailable();
      return prepareChangeBranchReview(proposal, flow, policy);
    } catch {
      return terminalChangeBranchFailure(state, policy);
    }
  }
  if (flow.step === 'awaiting_confirmation') {
    const answer = interactiveReplyId === 'change-branch-confirm:yes' ? 'نعم'
      : interactiveReplyId === 'change-branch-confirm:keep' ? 'لا' : policy.normalize(text);
    if (answer === 'لا') {
      clearChangeBranchState(state);
      return policy.changeBranchDeclined();
    }
    if (!['نعم', 'اوافق', 'تاكيد', 'اكد'].includes(answer)) {
      return policy.changeBranchAskConfirmation();
    }
    flow.confirmationPending = false;
    try {
      const result = await appointmentService.changeAppointmentBranch(
        clinicId, flow.selectedAppointmentId, flow.targetBranchId,
        flow.proposedStart, {
          patientId: patientId || (await appointmentService
            .resolveAppointmentForManagementByBookingReference(clinicId, flow.bookingReference))?.patientId,
          source: 'shaden', conversationId,
        }, flow.reviewedUpdatedAt
      );
      clearChangeBranchState(state);
      return {
        reply: policy.changeBranchSuccessful(result.booking_reference),
        lifecycleTerminalReason: 'completed',
      };
    } catch {
      return terminalChangeBranchFailure(state, policy);
    }
  }
  return terminalChangeBranchFailure(state, policy);
}

async function beginChangeBranchAppointmentSelection(
  candidates, state, policy, branches, appointmentService, bookingEngine,
  clinicId, patientId, now
) {
  if (!candidates.length) return terminalChangeBranchNoCandidates(state, policy);
  const flow = state.changeBranch;
  flow.candidateAppointmentIds = candidates.map(({ id }) => id);
  flow.ownershipVerified = true;
  if (candidates.length === 1) {
    flow.selectedAppointmentId = candidates[0].id;
    flow.bookingReference = candidates[0].booking_reference || flow.bookingReference;
    return continueWithTargetBranchHint(
      flow, state, policy, branches, candidates[0], appointmentService, clinicId,
      patientId, bookingEngine, now
    );
  }
  flow.step = 'awaiting_appointment';
  return {
    reply: policy.changeBranchChooseAppointment(),
    interaction: {
      version: 1, mode: 'list', purpose: 'select_change_branch_appointment',
      displayText: policy.changeBranchChooseAppointment(), listPrompt: 'عرض المواعيد',
      options: candidates.slice(0, 10).map((candidate) => ({
        id: `change-branch-appointment:${candidate.id}`,
        label: truncateInteractionText(
          `${policy.display(candidate.service_name || 'موعد')} — ${candidate.booking_reference}`, 24),
        description: truncateInteractionText(
          `${bidiIsolate(formatArabicRescheduleDate(candidate.appointment_start))} · ${bidiIsolate(formatArabicRescheduleTime(candidate.appointment_start))} · ${policy.display(candidate.branch_name || '')}`, 72),
      })),
    },
  };
}

async function continueWithTargetBranchHint(
  flow, state, policy, branches, candidate, appointmentService, clinicId, patientId,
  bookingEngine, now
) {
  const hinted = flow.targetBranchId
    ? branches.find(({ id }) => id === flow.targetBranchId) : null;
  if (!hinted || hinted.id === candidate.branch_id) {
    flow.targetBranchId = null;
    return showChangeBranchChoices(flow, state, policy, branches, candidate,
      appointmentService, clinicId, patientId);
  }
  const eligible = await appointmentService.listEligibleBranchChanges(
    clinicId, candidate.id, patientId
  );
  if (!eligible.some(({ id }) => id === hinted.id)) {
    flow.targetBranchId = null;
    return showChangeBranchChoices(flow, state, policy, branches, candidate,
      appointmentService, clinicId, patientId);
  }
  return advanceChangeBranchTarget({
    branch: hinted, flow, state, policy, appointmentService, bookingEngine,
    clinicId, patientId, now,
  });
}

async function advanceChangeBranchTarget({
  branch, flow, state, policy, appointmentService, bookingEngine,
  clinicId, patientId, now,
}) {
  let proposal;
  try {
    proposal = await appointmentService.previewBranchChange(
      clinicId, flow.selectedAppointmentId, branch.id, null, patientId
    );
  } catch (error) {
    if (error?.code === 'APPOINTMENT_BRANCH_UNCHANGED') {
      flow.targetBranchId = null;
      return policy.changeBranchSameBranch();
    }
    return terminalChangeBranchFailure(state, policy);
  }
  flow.targetBranchId = branch.id;
  if (!proposal.requiresNewSlot) return prepareChangeBranchReview(proposal, flow, policy);
  if (String(proposal.reason || '').includes('assignment_not_found')) {
    flow.targetBranchId = null;
    const candidate = proposal.appointment;
    return showChangeBranchChoices(flow, state, policy, [], candidate,
      appointmentService, clinicId, patientId);
  }
  const dates = await bookingEngine.getAvailableDates({
    clinicId, service: { id: proposal.appointment.service_id }, branch: { id: branch.id },
    fromDate: localDateString(now), searchDays: 31, limit: 31,
    excludeAppointmentId: proposal.appointment.id,
  });
  flow.availableDates = dates.dates || [];
  flow.step = 'awaiting_date';
  return interactionOptions(policy.changeBranchChooseDate(), 'select_change_branch_date',
    flow.availableDates, 'change-branch-date:', formatArabicRescheduleDate);
}

async function showChangeBranchChoices(
  flow, state, policy, branches, candidate, appointmentService, clinicId, patientId
) {
  flow.step = 'awaiting_branch';
  const authoritative = await appointmentService.listEligibleBranchChanges(
    clinicId, candidate.id, patientId
  );
  const options = authoritative.slice(0, 10);
  if (!options.length) return terminalChangeBranchFailure(state, policy);
  const summary = policy.changeBranchCurrentSummary(candidate);
  return {
    reply: summary,
    interaction: {
      version: 1, mode: 'list', purpose: 'select_change_branch_branch',
      displayText: summary, listPrompt: 'عرض الفروع',
      options: options.map((branch) => ({
        id: `change-branch-branch:${branch.id}`,
        label: truncateInteractionText(policy.display(branch.name), 24),
        description: truncateInteractionText(policy.display(branch.city || ''), 72),
      })),
    },
  };
}

function selectChangeBranch(text, replyId, branches, flow, policy) {
  if (replyId?.startsWith('change-branch-branch:')) {
    return branches.find(({ id }) => id === replyId.slice(21)) || null;
  }
  const normalized = policy.normalize(text);
  const matches = branches.filter(({ name }) => policy.normalize(name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

function resolveTargetBranchHint(text, branches, policy) {
  const normalized = policy.normalize(text);
  const compact = normalized.replace(/\s+/gu, '');
  const matches = branches.filter(({ name }) => {
    const full = policy.normalize(name).replace(/\s+/gu, '');
    const short = full.replace(/^فرع/u, '').replace(/^ال/u, '');
    return full && (compact.includes(full) || (short.length > 2 && compact.includes(short)));
  });
  return matches.length === 1 ? matches[0] : null;
}

function isCurrentChangeBranchInteractiveReply(flow, replyId) {
  if (!flow || !replyId) return false;
  const prefixes = {
    awaiting_appointment: 'change-branch-appointment:', awaiting_branch: 'change-branch-branch:',
    awaiting_date: 'change-branch-date:', awaiting_time: 'change-branch-time:',
  };
  if (prefixes[flow.step]) return replyId.startsWith(prefixes[flow.step]);
  return flow.step === 'awaiting_confirmation' && flow.confirmationPending === true &&
    ['change-branch-confirm:yes', 'change-branch-confirm:keep'].includes(replyId);
}

function prepareChangeBranchReview(proposal, flow, policy) {
  flow.proposedStart = proposal.appointmentStart;
  flow.reviewedUpdatedAt = new Date(proposal.appointment.updated_at).toISOString();
  flow.step = 'awaiting_confirmation';
  flow.confirmationPending = true;
  const review = policy.changeBranchReview(proposal);
  return {
    reply: review,
    interaction: {
      version: 1, mode: 'reply_buttons', purpose: 'confirm_change_branch',
      displayText: review,
      options: [
        { id: 'change-branch-confirm:yes', label: 'تأكيد تغيير الفرع' },
        { id: 'change-branch-confirm:keep', label: 'الاحتفاظ بالفرع' },
      ],
    },
  };
}

async function changeBranchCandidate(appointmentService, clinicId, patientId, flow) {
  const ownerId = patientId || (await appointmentService
    .resolveAppointmentForManagementByBookingReference(clinicId, flow.bookingReference))?.patientId;
  if (!ownerId) return null;
  return (await loadKnownPatientCandidates({ appointmentService, clinicId, patientId: ownerId }))
    .find(({ id, status }) => id === flow.selectedAppointmentId &&
      ['pending', 'confirmed'].includes(status)) || null;
}
function terminalChangeBranchFailure(state, policy) {
  clearChangeBranchState(state);
  return policy.changeBranchUnavailable();
}
function terminalChangeBranchNoCandidates(state, policy) {
  clearChangeBranchState(state);
  return policy.changeBranchNoCandidates();
}

async function handleChangeService({
  text, interactiveReplyId, inquiry, state, policy, appointmentService,
  bookingEngine, clinicId, patientId, conversationId, services, now,
}) {
  if (!appointmentService || !bookingEngine || !clinicId) {
    clearChangeServiceState(state);
    return policy.changeServiceUnavailable();
  }
  if (inquiry.type === 'change_service_request') {
    clearCancellationState(state);
    clearRescheduleState(state);
    state.changeService = createChangeServiceState({
      verificationRequired: !patientId,
      targetServiceId: resolveTargetServiceHint(text, services, policy)?.id || null,
    });
    if (!patientId) return policy.changeServiceAskBookingReference();
    const candidates = (await loadKnownPatientCandidates({
      appointmentService, clinicId, patientId,
    })).filter(({ status }) => ['pending', 'confirmed'].includes(status));
    return beginChangeServiceAppointmentSelection(
      candidates, state, policy, services, appointmentService, bookingEngine,
      clinicId, patientId, now
    );
  }
  const flow = state.changeService;
  if (!flow) return policy.changeServiceUnavailable();
  if (isCancellationAbandonment(text, policy)) {
    clearChangeServiceState(state);
    return policy.changeServiceDeclined();
  }
  if (flow.step === 'awaiting_reference') {
    const reference = extractBookingReference(text);
    if (!reference) return policy.changeServiceAskBookingReference();
    flow.bookingReference = reference;
    flow.step = 'awaiting_verification';
    return policy.changeServiceAskRegisteredMobile();
  }
  if (flow.step === 'awaiting_verification') {
    const verified = await appointmentService.verifyAppointmentOwnership(
      clinicId, flow.bookingReference, text
    );
    if (!verified?.verified) {
      flow.verificationAttempts += 1;
      if (flow.verificationAttempts >= 3) {
        clearChangeServiceState(state);
        return policy.changeServiceVerificationExhausted();
      }
      return policy.changeServiceVerificationFailed();
    }
    const candidates = (await loadKnownPatientCandidates({
      appointmentService, clinicId, patientId: verified.patientId,
    })).filter(({ id, status }) =>
      id === verified.appointmentId && ['pending', 'confirmed'].includes(status)
    );
    flow.ownershipVerified = true;
    return beginChangeServiceAppointmentSelection(
      candidates, state, policy, services, appointmentService, bookingEngine,
      clinicId, verified.patientId, now
    );
  }
  if (flow.step === 'awaiting_appointment') {
    const index = parseManagementSelection(
      text, interactiveReplyId, flow.candidateAppointmentIds,
      'change-service-appointment:', policy
    );
    if (index === null) return policy.changeServiceInvalidSelection();
    flow.selectedAppointmentId = flow.candidateAppointmentIds[index];
    const candidate = await changeServiceCandidate(
      appointmentService, clinicId, patientId, flow
    );
    if (!candidate) return terminalChangeServiceFailure(state, policy);
    flow.bookingReference = candidate.booking_reference || flow.bookingReference;
    return continueWithTargetServiceHint(
      flow, state, policy, services, candidate, appointmentService, clinicId,
      patientId || candidate.patient_id, bookingEngine, now
    );
  }
  if (flow.step === 'awaiting_service') {
    const service = selectChangeService(text, interactiveReplyId, services, flow, policy);
    if (!service) return policy.changeServiceInvalidSelection();
    const ownerId = patientId || (await appointmentService
      .resolveAppointmentForManagementByBookingReference(clinicId, flow.bookingReference))?.patientId;
    return advanceChangeServiceTarget({
      service, flow, state, policy, appointmentService, bookingEngine,
      clinicId, patientId: ownerId, now,
    });
  }
  if (flow.step === 'awaiting_date') {
    const date = parseOptionChoice(text, interactiveReplyId, flow.availableDates,
      'change-service-date:', policy);
    if (!date) return policy.changeServiceInvalidDate();
    flow.proposedDate = date;
    const candidate = await changeServiceCandidate(appointmentService, clinicId, patientId, flow);
    if (!candidate) return terminalChangeServiceFailure(state, policy);
    const times = await bookingEngine.getAvailableTimes({
      clinicId, service: { id: flow.targetServiceId },
      branch: { id: candidate.branch_id }, date,
      excludeAppointmentId: candidate.id,
    });
    flow.availableTimes = times.times || [];
    flow.step = 'awaiting_time';
    return interactionOptions(policy.changeServiceChooseTime(), 'select_change_service_time',
      flow.availableTimes, 'change-service-time:', formatArabicRescheduleTime);
  }
  if (flow.step === 'awaiting_time') {
    const time = parseOptionChoice(text, interactiveReplyId, flow.availableTimes,
      'change-service-time:', policy);
    if (!time) return policy.changeServiceInvalidTime();
    const candidate = await changeServiceCandidate(appointmentService, clinicId, patientId, flow);
    if (!candidate) return terminalChangeServiceFailure(state, policy);
    const parsed = parseBookingPreferredStart(`${flow.proposedDate} ${time}`, null, policy,
      { timeZone: DEFAULT_TIME_ZONE, now });
    if (!parsed.complete) return policy.changeServiceInvalidTime();
    flow.proposedStart = parsed.value;
    try {
      const proposal = await appointmentService.previewServiceChange(
        clinicId, candidate.id, flow.targetServiceId, flow.proposedStart,
        patientId || candidate.patient_id
      );
      if (proposal.requiresNewSlot) return policy.changeServiceSlotUnavailable();
      return prepareChangeServiceReview(proposal, flow, state, policy);
    } catch {
      return terminalChangeServiceFailure(state, policy);
    }
  }
  if (flow.step === 'awaiting_confirmation') {
    const answer = interactiveReplyId === 'change-service-confirm:yes' ? 'نعم'
      : interactiveReplyId === 'change-service-confirm:keep' ? 'لا' : policy.normalize(text);
    if (answer === 'لا') {
      clearChangeServiceState(state);
      return policy.changeServiceDeclined();
    }
    if (!['نعم', 'اوافق', 'تاكيد', 'اكد'].includes(answer)) {
      return policy.changeServiceAskConfirmation();
    }
    try {
      const result = await appointmentService.changeAppointmentService(
        clinicId, flow.selectedAppointmentId, flow.targetServiceId,
        flow.proposedStart, {
          patientId: patientId || (await appointmentService
            .resolveAppointmentForManagementByBookingReference(clinicId, flow.bookingReference))?.patientId,
          source: 'shaden', conversationId,
        }, flow.reviewedUpdatedAt
      );
      clearChangeServiceState(state);
      return {
        reply: policy.changeServiceSuccessful(result.booking_reference),
        lifecycleTerminalReason: 'completed',
      };
    } catch {
      return terminalChangeServiceFailure(state, policy);
    }
  }
  return terminalChangeServiceFailure(state, policy);
}

async function beginChangeServiceAppointmentSelection(
  candidates, state, policy, services, appointmentService, bookingEngine,
  clinicId, patientId, now
) {
  if (!candidates.length) return terminalChangeServiceNoCandidates(state, policy);
  const flow = state.changeService;
  flow.candidateAppointmentIds = candidates.map(({ id }) => id);
  flow.ownershipVerified = true;
  if (candidates.length === 1) {
    flow.selectedAppointmentId = candidates[0].id;
    flow.bookingReference = candidates[0].booking_reference || flow.bookingReference;
    return continueWithTargetServiceHint(
      flow, state, policy, services, candidates[0], appointmentService, clinicId, patientId
      , bookingEngine, now
    );
  }
  flow.step = 'awaiting_appointment';
  return {
    reply: policy.changeServiceChooseAppointment(),
    interaction: {
      version: 1, mode: 'list', purpose: 'select_change_service_appointment',
      displayText: policy.changeServiceChooseAppointment(), listPrompt: 'عرض المواعيد',
      options: candidates.slice(0, 10).map((candidate) => ({
        id: `change-service-appointment:${candidate.id}`,
        label: truncateInteractionText(
          `${policy.display(candidate.service_name || 'موعد')} — ${candidate.booking_reference}`, 24),
        description: truncateInteractionText(
          `${bidiIsolate(formatArabicRescheduleDate(candidate.appointment_start))} · ${bidiIsolate(formatArabicRescheduleTime(candidate.appointment_start))} · ${policy.display(candidate.branch_name || '')}`, 72),
      })),
    },
  };
}

async function continueWithTargetServiceHint(
  flow, state, policy, services, candidate, appointmentService, clinicId, patientId,
  bookingEngine, now
) {
  const hinted = flow.targetServiceId
    ? services.find(({ id }) => id === flow.targetServiceId)
    : null;
  if (!hinted || hinted.id === candidate.service_id) {
    flow.targetServiceId = null;
    return showChangeServiceChoices(
      flow, state, policy, services, candidate, appointmentService, clinicId, patientId
    );
  }
  const eligible = appointmentService?.listEligibleServiceChanges
    ? await appointmentService.listEligibleServiceChanges(clinicId, candidate.id, patientId)
    : services;
  if (!eligible.some(({ id }) => id === hinted.id)) {
    flow.targetServiceId = null;
    return showChangeServiceChoices(
      flow, state, policy, services, candidate, appointmentService, clinicId, patientId
    );
  }
  return advanceChangeServiceTarget({
    service: hinted, flow, state, policy, appointmentService, bookingEngine,
    clinicId, patientId, now,
  });
}

async function advanceChangeServiceTarget({
  service, flow, state, policy, appointmentService, bookingEngine,
  clinicId, patientId, now,
}) {
  let proposal;
  try {
    proposal = await appointmentService.previewServiceChange(
      clinicId, flow.selectedAppointmentId, service.id, null, patientId
    );
  } catch (error) {
    return error?.code === 'APPOINTMENT_SERVICE_UNCHANGED'
      ? policy.changeServiceSameService()
      : terminalChangeServiceFailure(state, policy);
  }
  flow.targetServiceId = service.id;
  if (!proposal.requiresNewSlot) {
    return prepareChangeServiceReview(proposal, flow, state, policy);
  }
  if (String(proposal.reason || '').includes('assignment_not_found')) {
    return terminalChangeServiceFailure(state, policy);
  }
  const dates = await bookingEngine.getAvailableDates({
    clinicId, service: { id: service.id },
    branch: { id: proposal.appointment.branch_id }, fromDate: localDateString(now),
    searchDays: 31, limit: 31, excludeAppointmentId: proposal.appointment.id,
  });
  flow.availableDates = dates.dates || [];
  flow.step = 'awaiting_date';
  return interactionOptions(policy.changeServiceChooseDate(), 'select_change_service_date',
    flow.availableDates, 'change-service-date:', formatArabicRescheduleDate);
}

async function showChangeServiceChoices(
  flow, state, policy, services, candidate = null,
  appointmentService = null, clinicId = null, patientId = null
) {
  flow.step = 'awaiting_service';
  const authoritative = candidate && appointmentService?.listEligibleServiceChanges
    ? await appointmentService.listEligibleServiceChanges(
      clinicId, candidate.id, patientId
    )
    : services;
  const options = authoritative.filter(({ id, isBookingEnabled, is_booking_enabled }) =>
    id && id !== candidate?.service_id && isBookingEnabled !== false && is_booking_enabled !== false
  ).slice(0, 10);
  if (!options.length) return terminalChangeServiceFailure(state, policy);
  const summary = candidate ? policy.changeServiceCurrentSummary(candidate) : policy.changeServiceChooseService();
  return {
    reply: summary,
    interaction: {
      version: 1, mode: 'list', purpose: 'select_change_service_service',
      displayText: summary, listPrompt: 'عرض الخدمات',
      options: options.map((service) => ({
        id: `change-service-service:${service.id}`,
        label: truncateInteractionText(policy.display(service.name), 24),
      })),
    },
  };
}

function selectChangeService(text, replyId, services, flow, policy) {
  if (replyId?.startsWith('change-service-service:')) {
    return services.find(({ id }) => id === replyId.slice(23)) || null;
  }
  const normalized = policy.normalize(text);
  const matches = services.filter(({ name }) => policy.normalize(name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

function resolveTargetServiceHint(text, services, policy) {
  const normalized = policy.normalize(text);
  const tail = normalized.match(/(?:\sل|\sالي\s|\sالى\s|\sto\s)([^\s].*)$/u)?.[1];
  if (!tail) return null;
  const matches = services.filter(({ name }) => {
    const serviceName = policy.normalize(name);
    return serviceName && (tail === serviceName || tail.includes(serviceName));
  });
  return matches.length === 1 ? matches[0] : null;
}

function isCurrentChangeServiceInteractiveReply(flow, replyId) {
  if (!flow || !replyId) return false;
  const prefixes = {
    awaiting_appointment: 'change-service-appointment:',
    awaiting_service: 'change-service-service:',
    awaiting_date: 'change-service-date:',
    awaiting_time: 'change-service-time:',
  };
  if (prefixes[flow.step]) return replyId.startsWith(prefixes[flow.step]);
  return flow.step === 'awaiting_confirmation' && flow.confirmationPending === true &&
    ['change-service-confirm:yes', 'change-service-confirm:keep'].includes(replyId);
}

function prepareChangeServiceReview(proposal, flow, state, policy) {
  flow.proposedStart = proposal.appointmentStart;
  flow.reviewedUpdatedAt = new Date(proposal.appointment.updated_at).toISOString();
  flow.step = 'awaiting_confirmation';
  flow.confirmationPending = true;
  return {
    reply: policy.changeServiceReview(proposal),
    interaction: {
      version: 1, mode: 'reply_buttons', purpose: 'confirm_change_service',
      displayText: policy.changeServiceReview(proposal),
      options: [
        { id: 'change-service-confirm:yes', label: 'تأكيد تغيير الخدمة' },
        { id: 'change-service-confirm:keep', label: 'الاحتفاظ بالخدمة' },
      ],
    },
  };
}

async function changeServiceCandidate(appointmentService, clinicId, patientId, flow) {
  const ownerId = patientId || (await appointmentService
    .resolveAppointmentForManagementByBookingReference(clinicId, flow.bookingReference))?.patientId;
  if (!ownerId) return null;
  return (await loadKnownPatientCandidates({ appointmentService, clinicId, patientId: ownerId }))
    .find(({ id, status }) => id === flow.selectedAppointmentId && ['pending', 'confirmed'].includes(status)) || null;
}

function terminalChangeServiceFailure(state, policy) {
  clearChangeServiceState(state);
  return policy.changeServiceUnavailable();
}
function terminalChangeServiceNoCandidates(state, policy) {
  clearChangeServiceState(state);
  return policy.changeServiceNoCandidates();
}

function beginRescheduleSelection(candidates, state, policy) {
  if (!candidates.length) return resetUnavailableReschedule(state, policy);
  state.reschedule.candidateAppointmentIds = candidates.map(({ id }) => id);
  state.reschedule.ownershipVerified = true;
  state.reschedule.step = 'awaiting_selection';
  return {
    reply: policy.rescheduleChooseAppointment(),
    interaction: {
      version: 1, mode: 'list', purpose: 'select_reschedule_appointment',
      displayText: policy.rescheduleChooseAppointment(), listPrompt: 'عرض المواعيد',
      options: candidates.slice(0, 10).map((candidate) => ({
        id: `reschedule-appointment:${candidate.id}`,
        label: truncateInteractionText(
          `${policy.display(candidate.service_name || 'موعد')} — ${candidate.booking_reference || 'بدون مرجع'}`,
          24
        ),
        description: truncateInteractionText([
          `التاريخ: ${bidiIsolate(formatArabicRescheduleDate(candidate.appointment_start))}`,
          `الوقت: ${bidiIsolate(formatArabicRescheduleTime(candidate.appointment_start))}`,
          `الفرع: ${policy.display(candidate.branch_name || 'غير محدد')}`,
        ].join(' · '), 72),
      })),
    },
  };
}

async function loadRescheduleDates({ selected, state, policy, bookingEngine, clinicId, now }) {
  const result = await bookingEngine.getAvailableDates({
    clinicId, service: { id: selected.service_id }, branch: { id: selected.branch_id },
    doctor: selected.doctor_id ? { id: selected.doctor_id } : null,
    room: selected.room_id ? { id: selected.room_id } : null,
    fromDate: localDateString(now), searchDays: 31, limit: 31,
    excludeAppointmentId: selected.id,
  });
  state.reschedule.availableDates = result.dates || [];
  state.reschedule.step = 'awaiting_date';
  return interactionOptions(policy.rescheduleChooseDate(), 'select_reschedule_date',
    state.reschedule.availableDates, 'reschedule-date:', formatArabicRescheduleDate);
}

function interactionOptions(reply, purpose, values, prefix, label) {
  if (!values.length) return reply;
  return { reply, interaction: { version: 1, mode: 'list', purpose,
    displayText: reply, listPrompt: 'عرض الخيارات', options: values.slice(0, 10).map((value, index) => ({
      id: `${prefix}${value}`, label: label(value, index),
    })) } };
}

function bidiIsolate(value) {
  return `\u2068${value}\u2069`;
}

function formatArabicRescheduleDate(value) {
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatArabicRescheduleTime(value) {
  const date = /^\d{2}:\d{2}$/.test(value)
    ? new Date(`2000-01-01T${value}:00`)
    : new Date(value);
  const hour = date.getHours();
  return `${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hour < 12 ? 'ص' : 'م'}`;
}

function parseManagementSelection(text, replyId, ids, prefix, policy) {
  if (replyId?.startsWith(prefix)) {
    const index = ids.indexOf(replyId.slice(prefix.length));
    return index < 0 ? null : index;
  }
  const match = policy.normalize(text).match(/^(\d{1,2})$/);
  const index = match ? Number(match[1]) - 1 : -1;
  return index >= 0 && index < ids.length ? index : null;
}

function parseOptionChoice(text, replyId, options, prefix, policy) {
  if (replyId?.startsWith(prefix)) {
    const value = replyId.slice(prefix.length);
    return options.includes(value) ? value : null;
  }
  const normalized = policy.normalize(text);
  if (options.includes(normalized)) return normalized;
  const index = Number(normalized) - 1;
  return Number.isInteger(index) && options[index] ? options[index] : null;
}

async function reloadRescheduleCandidate({ appointmentService, clinicId, patientId, flow }) {
  let ownerId = patientId;
  if (!ownerId) ownerId = (await resolveRescheduleOwner(appointmentService, clinicId, flow))?.patientId;
  if (!ownerId) return null;
  const candidates = await loadRescheduleCandidates({ appointmentService, clinicId, patientId: ownerId });
  return candidates.find(({ id }) => id === flow.selectedAppointmentId) || null;
}

function resolveRescheduleOwner(appointmentService, clinicId, flow) {
  return appointmentService.resolveAppointmentForManagementByBookingReference(clinicId, flow.bookingReference);
}

async function loadRescheduleCandidates(input) {
  const candidates = await loadKnownPatientCandidates(input);
  return candidates.filter(({ status }) => ['pending', 'confirmed'].includes(status));
}

function resetUnavailableReschedule(state, policy) {
  clearRescheduleState(state);
  return policy.rescheduleUnavailable();
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function handleKnownPhoneCancellation({
  text,
  interactiveReplyId,
  inquiry,
  state,
  policy,
  appointmentService,
  clinicId,
  patientId,
  conversationId,
}) {
  if (
    !appointmentService ||
    typeof appointmentService.getFutureManagementCandidates !== 'function' ||
    !clinicId
  ) {
    clearCancellationState(state);
    return policy.cancellationUnavailable();
  }

  if (inquiry.type === 'booking_cancellation_request') {
    replaceCancellationState(state, {
      step: 'awaiting_selection',
      bookingReference: inquiry.bookingReference || null,
      verificationRequired: false,
    });
    const candidates = await loadKnownPatientCandidates({
      appointmentService,
      clinicId,
      patientId,
    });
    let matchingCandidates = candidates;

    if (inquiry.bookingReference) {
      if (
        typeof appointmentService
          .resolveAppointmentForManagementByBookingReference !== 'function'
      ) {
        clearCancellationState(state);
        return policy.cancellationNoCandidates();
      }
      const resolved = await appointmentService
        .resolveAppointmentForManagementByBookingReference(
          clinicId,
          inquiry.bookingReference
        );
      if (
        !resolved ||
        resolved.clinicId !== clinicId ||
        resolved.patientId !== patientId
      ) {
        clearCancellationState(state);
        return policy.cancellationNoCandidates();
      }
      matchingCandidates = candidates.filter((candidate) =>
        candidate.id === resolved.appointmentId &&
        candidate.booking_reference === inquiry.bookingReference
      );
    }

    return beginKnownCancellationSelection({
      candidates: matchingCandidates,
      state,
      policy,
    });
  }

  const cancellation = state.cancellation;
  if (!cancellation) return policy.cancellationNoCandidates();

  if (cancellation.step === 'awaiting_selection') {
    const selection = parseCancellationSelection(
      text,
      interactiveReplyId,
      cancellation.candidateAppointmentIds,
      policy
    );
    if (
      selection === null ||
      selection < 0 ||
      selection >= cancellation.candidateAppointmentIds.length
    ) {
      return policy.cancellationInvalidSelection(
        cancellation.candidateAppointmentIds.length
      );
    }
    const candidates = await loadKnownPatientCandidates({
      appointmentService,
      clinicId,
      patientId,
    });
    const selectedId = cancellation.candidateAppointmentIds[selection];
    const selected = candidates.find((candidate) =>
      candidate.id === selectedId
    );
    if (!selected) {
      clearCancellationState(state);
      return policy.cancellationNoCandidates();
    }
    return prepareKnownCancellationReview({
      candidate: selected,
      candidateIds: cancellation.candidateAppointmentIds,
      state,
      policy,
    });
  }

  if (cancellation.step === 'awaiting_confirmation') {
    return handleCancellationConfirmation({
      text,
      interactiveReplyId,
      state,
      policy,
      appointmentService,
      clinicId,
      patientId,
      conversationId,
    });
  }

  clearCancellationState(state);
  return policy.cancellationNoCandidates();
}

async function handleUnknownPhoneCancellation({
  text,
  interactiveReplyId,
  inquiry,
  state,
  policy,
  appointmentService,
  clinicId,
  conversationId,
}) {
  if (!appointmentService || !clinicId) {
    clearCancellationState(state);
    return policy.cancellationUnavailable();
  }

  if (inquiry.type === 'booking_cancellation_request') {
    const suppliedReference = inquiry.bookingReference ||
      extractBookingReference(text);
    const hasSuppliedValue = Boolean(suppliedReference) ||
      hasCancellationReferenceSuffix(text, policy);
    replaceCancellationState(state, {
      step: hasSuppliedValue
        ? 'awaiting_verification'
        : 'awaiting_reference',
      bookingReference: suppliedReference || null,
      verificationRequired: true,
    });
    return hasSuppliedValue
      ? policy.cancellationAskRegisteredMobile()
      : policy.cancellationAskBookingReference();
  }

  const cancellation = state.cancellation;
  if (!cancellation) return policy.cancellationAskBookingReference();
  if (isCancellationAbandonment(text, policy)) {
    clearCancellationState(state);
    return policy.cancellationAbandoned();
  }

  if (cancellation.step === 'awaiting_reference') {
    cancellation.bookingReference = extractBookingReference(text);
    cancellation.step = 'awaiting_verification';
    return policy.cancellationAskRegisteredMobile();
  }

  if (cancellation.step === 'awaiting_verification') {
    if (
      typeof appointmentService.verifyAppointmentOwnership !== 'function'
    ) {
      clearCancellationState(state);
      return policy.cancellationUnavailable();
    }
    const verification = await appointmentService.verifyAppointmentOwnership(
      clinicId,
      cancellation.bookingReference,
      text
    );
    if (!verification?.verified) {
      return recordUnknownVerificationFailure({ state, policy });
    }

    const candidate = await loadVerifiedUnknownCandidate({
      appointmentService,
      clinicId,
      verification,
    });
    if (!candidate) {
      return recordUnknownVerificationFailure({ state, policy });
    }

    return prepareKnownCancellationReview({
      candidate,
      candidateIds: [candidate.id],
      state,
      policy,
      verificationRequired: true,
    });
  }

  if (cancellation.step === 'awaiting_confirmation') {
    return handleCancellationConfirmation({
      text,
      interactiveReplyId,
      state,
      policy,
      appointmentService,
      clinicId,
      conversationId,
    });
  }

  clearCancellationState(state);
  return policy.cancellationAbandoned();
}

async function loadVerifiedUnknownCandidate({
  appointmentService,
  clinicId,
  verification,
}) {
  if (
    !verification.appointmentId ||
    !verification.patientId ||
    typeof appointmentService.getFutureManagementCandidates !== 'function'
  ) {
    return null;
  }
  const candidates = await loadKnownPatientCandidates({
    appointmentService,
    clinicId,
    patientId: verification.patientId,
  });
  return candidates.find((candidate) =>
    candidate.id === verification.appointmentId
  ) || null;
}

function recordUnknownVerificationFailure({ state, policy }) {
  recordCancellationVerificationFailure(state);
  return state.cancellation
    ? policy.cancellationVerificationFailed()
    : policy.cancellationVerificationExhausted();
}

function hasCancellationReferenceSuffix(text, policy) {
  const normalized = policy.normalize(text);
  return /^(?:الغاء|الغي|الغيه)\s+(?:الحجز|حجزي|موعد|موعدي)\s+\S/u.test(
    normalized
  );
}

function isCancellationAbandonment(text, policy) {
  return ['الغاء', 'تراجع', 'خروج', 'انهاء'].includes(
    policy.normalize(text)
  );
}

async function handleCancellationConfirmation({
  text,
  interactiveReplyId,
  state,
  policy,
  appointmentService,
  clinicId,
  patientId = null,
  conversationId = null,
}) {
  const cancellation = state.cancellation;
  const normalized = interactiveReplyId === 'cancellation-confirm:yes'
    ? 'نعم'
    : interactiveReplyId === 'cancellation-confirm:keep'
      ? 'لا'
      : policy.normalize(text);
  if (['لا', 'الغاء', 'تراجع'].includes(normalized)) {
    clearCancellationState(state);
    return policy.cancellationDeclined();
  }
  const reason = extractVolunteeredCancellationReason(text, policy);
  if (reason) {
    cancellation.cancellationReason = reason;
    return cancellationConfirmationReply(policy);
  }
  if (!isExplicitCancellationConfirmation(normalized)) {
    return cancellationConfirmationReply(policy);
  }
  if (!isCancellationReadyForExecution(cancellation)) {
    clearCancellationState(state);
    return policy.cancellationUnavailable();
  }

  try {
    let verifiedPatientId = patientId;
    if (!verifiedPatientId) {
      const resolved = await resolveVerifiedCancellationOwner({
        appointmentService,
        clinicId,
        cancellation,
      });
      verifiedPatientId = resolved?.patientId || null;
    }
    if (
      !verifiedPatientId ||
      typeof appointmentService?.cancelAppointment !== 'function'
    ) {
      clearCancellationState(state);
      return policy.cancellationAppointmentUnavailable();
    }
    const result = await appointmentService.cancelAppointment(
      clinicId,
      cancellation.selectedAppointmentId,
      cancellation.cancellationReason || null,
      null,
      {
        patientId: verifiedPatientId,
        source: 'shaden',
        ...(conversationId ? { conversationId } : {}),
      }
    );
    clearCancellationState(state);
    if (isAlreadyCancelledResult(result)) {
      return policy.cancellationAlreadyCancelled();
    }
    if (result?.communication?.attempted === true) {
      return {
        reply: result.communication.success === false
          ? policy.cancellationNotificationPending()
          : null,
        notificationAttempted: true,
        lifecycleTerminalReason: 'completed',
      };
    }
    return {
      reply: policy.cancellationSuccessful(),
      lifecycleTerminalReason: 'completed',
    };
  } catch (error) {
    clearCancellationState(state);
    return cancellationFailureReply(error, policy);
  }
}

function isExplicitCancellationConfirmation(normalized) {
  return ['نعم', 'اوافق', 'تاكيد', 'اكد', 'نعم اؤكد'].includes(normalized);
}

function isCancellationReadyForExecution(cancellation) {
  return Boolean(
    cancellation &&
    cancellation.step === 'awaiting_confirmation' &&
    cancellation.ownershipVerified === true &&
    cancellation.confirmationPending === true &&
    cancellation.reviewedUpdatedAt &&
    isUuid(cancellation.selectedAppointmentId) &&
    cancellation.candidateAppointmentIds.includes(
      cancellation.selectedAppointmentId
    )
  );
}

async function resolveVerifiedCancellationOwner({
  appointmentService,
  clinicId,
  cancellation,
}) {
  if (
    !cancellation.verificationRequired ||
    !cancellation.bookingReference ||
    typeof appointmentService?.resolveAppointmentForManagementByBookingReference !== 'function'
  ) {
    return null;
  }
  const resolved = await appointmentService
    .resolveAppointmentForManagementByBookingReference(
      clinicId,
      cancellation.bookingReference
    );
  return resolved &&
    resolved.clinicId === clinicId &&
    resolved.appointmentId === cancellation.selectedAppointmentId
    ? resolved
    : null;
}

function isAlreadyCancelledResult(result) {
  return Boolean(
    result?.alreadyCancelled === true ||
    result?.idempotent === true ||
    result?.outcome === 'already_cancelled'
  );
}

function cancellationFailureReply(error, policy) {
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  if (
    code === 'APPOINTMENT_STALE' ||
    code === 'APPOINTMENT_CONFLICT' ||
    name === 'ConflictError' ||
    message.includes('changed after it was reviewed')
  ) {
    return policy.cancellationStale();
  }
  if (code === 'APPOINTMENT_NOT_FOUND' || name === 'NotFoundError') {
    return policy.cancellationAppointmentUnavailable();
  }
  if (
    code === 'APPOINTMENT_NOT_CANCELLABLE' ||
    code === 'INVALID_APPOINTMENT_TRANSITION' ||
    name === 'ValidationError' ||
    message.includes('transition') ||
    message.includes('cannot be cancelled')
  ) {
    return policy.cancellationNoLongerCancellable();
  }
  return policy.cancellationExecutionFailed();
}

async function loadKnownPatientCandidates({
  appointmentService,
  clinicId,
  patientId,
}) {
  const candidates = await appointmentService.getFutureManagementCandidates(
    clinicId,
    patientId
  );
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((candidate) =>
    candidate &&
    candidate.clinic_id === clinicId &&
    candidate.patient_id === patientId &&
    isUuid(candidate.id)
  );
}

function beginKnownCancellationSelection({ candidates, state, policy }) {
  if (candidates.length === 0) {
    clearCancellationState(state);
    return policy.cancellationNoCandidates();
  }
  if (candidates.length === 1) {
    return prepareKnownCancellationReview({
      candidate: candidates[0],
      candidateIds: [candidates[0].id],
      state,
      policy,
    });
  }

  state.cancellation.step = 'awaiting_selection';
  state.cancellation.candidateAppointmentIds = candidates.map(
    (candidate) => candidate.id
  );
  state.cancellation.selectedAppointmentId = null;
  state.cancellation.confirmationPending = false;
  const reply = policy.cancellationCandidates(candidates);
  if (candidates.length > 10) return reply;
  const options = candidates.map((candidate, index) => {
    const schedule = formatCancellationSchedule(candidate.appointment_start);
    return {
      id: `cancellation-appointment:${candidate.id}`,
      label: truncateInteractionText(
        `${index + 1}. ${policy.display(candidate.service_name || 'موعد')}`,
        24
      ),
      description: truncateInteractionText(
        `${schedule} — ${policy.display(candidate.branch_name || 'فرع غير محدد')}`,
        72
      ),
    };
  });
  if (options.some((option) =>
    option.id.length > 200 || !option.label || !option.description
  )) return reply;
  return {
    reply,
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_cancellation_appointment',
      displayText: 'يرجى اختيار الموعد المراد إلغاؤه.',
      listPrompt: 'عرض المواعيد',
      options,
    },
  };
}

function prepareKnownCancellationReview({
  candidate,
  candidateIds,
  state,
  policy,
  verificationRequired = false,
}) {
  const cancellation = state.cancellation;
  cancellation.step = 'awaiting_confirmation';
  cancellation.candidateAppointmentIds = [...candidateIds];
  cancellation.selectedAppointmentId = candidate.id;
  cancellation.bookingReference = candidate.booking_reference || null;
  cancellation.verificationRequired = verificationRequired;
  cancellation.ownershipVerified = true;
  cancellation.confirmationPending = true;
  cancellation.reviewedUpdatedAt = candidate.updated_at
    ? new Date(candidate.updated_at).toISOString()
    : null;
  return cancellationConfirmationReply(
    policy,
    policy.cancellationReview(candidate)
  );
}

function parseCancellationSelection(
  text,
  interactiveReplyId,
  candidateAppointmentIds,
  policy
) {
  const prefix = 'cancellation-appointment:';
  if (
    typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith(prefix)
  ) {
    const appointmentId = interactiveReplyId.slice(prefix.length);
    const index = candidateAppointmentIds.indexOf(appointmentId);
    return index >= 0 ? index : null;
  }
  const normalized = policy.normalize(text);
  const match = normalized.match(/^(?:اختيار\s*)?(\d{1,2})$/u);
  if (!match) return null;
  return Number(match[1]) - 1;
}

function cancellationConfirmationReply(policy, reply = null) {
  return {
    reply: reply || policy.cancellationAskConfirmation(),
    interaction: {
      version: 1,
      mode: 'reply_buttons',
      purpose: 'confirm_appointment_cancellation',
      displayText: 'تأكيد إلغاء هذا الموعد؟',
      options: [
        { id: 'cancellation-confirm:yes', label: 'تأكيد الإلغاء' },
        { id: 'cancellation-confirm:keep', label: 'الاحتفاظ بالموعد' },
      ],
    },
  };
}

function formatCancellationSchedule(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'موعد غير محدد';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    timeZone: 'Asia/Riyadh',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function truncateInteractionText(value, limit) {
  const text = String(value || '').trim();
  return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + '…';
}

function extractVolunteeredCancellationReason(text, policy) {
  const normalized = policy.normalize(text);
  const match = normalized.match(/^(?:السبب|سبب الالغاء)\s*[:\-]?\s+(.{1,200})$/u);
  return match?.[1]?.trim() || null;
}

function advanceFromServiceSelection(booking, service, data, policy, text = '') {
  transitionBookingSelection(booking, 'serviceId', service.id);
  const branchesForService = compatibleBranches(data, service.id);
  if (branchesForService.length === 0) {
    transitionBookingSelection(booking, 'serviceId', null);
    booking.step = 'service';
    return policy.bookingServiceNotOffered();
  }
  const cities = availableCities(branchesForService, policy);
  const mentionedCity = cities.find((city) =>
    policy.normalize(text).includes(policy.normalize(city))
  );
  if (mentionedCity) {
    transitionBookingSelection(booking, 'city', mentionedCity);
    booking.step = 'branch';
    const branches = branchesForCity(
      branchesForService,
      mentionedCity,
      policy
    );
    return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
  }
  if (cities.length > 1) {
    booking.step = 'city';
    return cityListReply(policy.bookingChooseCity(cities), cities, policy);
  }
  booking.city = cities[0] || null;
  booking.step = 'branch';
  const branches = branchesForCity(branchesForService, booking.city, policy);
  return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
}

const BOOKING_DEPENDENCIES = Object.freeze({
  specialtyId: Object.freeze([
    'serviceId', 'city', 'branchId', 'doctorId', 'roomId', 'date',
    'datePeriod', 'timePeriod', 'preferredStart', 'paymentMethodId',
    'insuranceCompanyId', 'insuranceClassId',
  ]),
  serviceId: Object.freeze([
    'city', 'branchId', 'doctorId', 'roomId', 'date', 'datePeriod',
    'timePeriod', 'preferredStart', 'paymentMethodId',
    'insuranceCompanyId', 'insuranceClassId',
  ]),
  city: Object.freeze([
    'branchId', 'doctorId', 'roomId', 'date', 'datePeriod', 'timePeriod',
    'preferredStart', 'paymentMethodId', 'insuranceCompanyId',
    'insuranceClassId',
  ]),
  branchId: Object.freeze([
    'doctorId', 'roomId', 'date', 'datePeriod', 'timePeriod',
    'preferredStart', 'paymentMethodId', 'insuranceCompanyId',
    'insuranceClassId',
  ]),
});

function transitionBookingSelection(booking, field, value) {
  booking[field] = value;
  for (const dependent of BOOKING_DEPENDENCIES[field] || []) {
    booking[dependent] = null;
  }
}

function compatibleBranches(data, serviceId) {
  if (!data.serviceBranchCompatibilityAvailable) return data.branches;
  const branchIds = new Set(
    data.serviceBranchAssignments
      .filter((item) => String(item.serviceId) === String(serviceId))
      .map((item) => String(item.branchId))
  );
  return data.branches.filter((branch) => branchIds.has(String(branch.id)));
}

function compatibleBookableServices(data) {
  const services = bookableServices(data.services);
  if (!data.serviceBranchCompatibilityAvailable) return services;
  return services.filter((service) =>
    compatibleBranches(data, service.id).length > 0
  );
}

function serviceOfferedAtBranch(data, serviceId, branchId) {
  if (!data.serviceBranchCompatibilityAvailable) return true;
  return data.serviceBranchAssignments.some((item) =>
    String(item.serviceId) === String(serviceId) &&
    String(item.branchId) === String(branchId)
  );
}

function handleBookingUpstreamChange({
  text,
  interactiveReplyId,
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  now,
}) {
  if (['specialty', 'service'].includes(booking.step)) {
    return null;
  }
  const specialty = findSpecialtySelection(
    interactiveReplyId,
    text,
    data,
    policy
  );
  if (specialty.matched && specialty.specialtyId !== booking.specialtyId) {
    transitionBookingSelection(booking, 'specialtyId', specialty.specialtyId);
    booking.step = 'service';
    const services = servicesForSpecialty(
      compatibleBookableServices(data),
      specialty.specialtyId
    );
    return serviceListReply(
      policy.bookingChooseService(services, data.clinic),
      services,
      policy
    );
  }
  const service = findServiceSelection(
    interactiveReplyId,
    text,
    compatibleBookableServices(data),
    policy
  );
  if (service && service.id !== booking.serviceId) {
    return advanceFromServiceSelection(booking, service, data, policy, text);
  }
  const serviceBranches = compatibleBranches(data, booking.serviceId);
  const serviceCities = availableCities(serviceBranches, policy);
  const city = findCitySelection(interactiveReplyId, text, serviceCities, policy);
  if (city && policy.normalize(city) !== policy.normalize(booking.city)) {
    transitionBookingSelection(booking, 'city', city);
    booking.step = 'branch';
    const branches = branchesForCity(serviceBranches, city, policy);
    return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
  }
  const branch = findBranchSelection(
    interactiveReplyId,
    text,
    data.branches,
    policy
  );
  if (branch && branch.id !== booking.branchId) {
    if (!serviceBranches.some((item) => item.id === branch.id)) {
      booking.step = 'branch';
      return branchListReply(
        policy.bookingServiceNotOffered(),
        branchesForCity(serviceBranches, booking.city, policy),
        policy
      );
    }
    transitionBookingSelection(booking, 'city', branch.city || booking.city);
    transitionBookingSelection(booking, 'branchId', branch.id);
    booking.step = 'date_period';
    return bookingDatePeriodListReply({
      booking,
      data,
      policy,
      bookingEngine,
      bookingContext,
      now,
    });
  }
  return null;
}

function emptyBookingState() {
  return {
    step: 'specialty',
    specialtyId: null,
    serviceId: null,
    city: null,
    branchId: null,
    doctorId: null,
    roomId: null,
    date: null,
    datePeriod: null,
    timePeriod: null,
    preferredStart: null,
    paymentMethodId: null,
    insuranceCompanyId: null,
    insuranceClassId: null,
  };
}

function handleBookingStep({
  text,
  interactiveReplyId,
  inquiry,
  data,
  state,
  policy,
  replyFor,
  bookingEngine,
  bookingContext,
  customerName,
  now,
}) {
  const booking = state.booking;

  const upstreamChange = handleBookingUpstreamChange({
    text,
    interactiveReplyId,
    booking,
    data,
    policy,
    bookingEngine,
    bookingContext,
    now,
  });
  if (upstreamChange) return upstreamChange;
  if (
    booking.branchId &&
    !serviceOfferedAtBranch(data, booking.serviceId, booking.branchId)
  ) {
    transitionBookingSelection(booking, 'branchId', null);
    booking.step = 'branch';
    const branches = branchesForCity(
      compatibleBranches(data, booking.serviceId),
      booking.city,
      policy
    );
    return branchListReply(
      policy.bookingServiceNotOffered(),
      branches,
      policy
    );
  }

  if (typeof interactiveReplyId !== 'string') {
    const branch = findById(data.branches, booking.branchId);
    let preference = null;
    try {
      preference = parseBookingPreferredStart(
        text,
        booking.date ? `date:${booking.date}` : booking.preferredStart,
        policy,
        { timeZone: branch?.timezone || DEFAULT_TIME_ZONE, now }
      ).preference || null;
    } catch (error) {
      preference = null;
    }
    if (preference) {
      return handleBookingAvailabilityPreference({
        preference,
        booking,
        data,
        policy,
        bookingEngine,
        bookingContext,
        now,
      });
    }
  }

  switch (booking.step) {
    case 'specialty': {
      const selection = findSpecialtySelection(
        interactiveReplyId,
        text,
        data,
        policy
      );
      if (!selection.matched) {
        return specialtyListReply(
          policy.specialties(bookingSpecialties(data), data.clinic),
          data,
          policy
        );
      }
      transitionBookingSelection(
        booking,
        'specialtyId',
        selection.specialtyId
      );
      booking.step = 'service';
      const services = servicesForSpecialty(
        compatibleBookableServices(data),
        selection.specialtyId
      );
      const reply = policy.bookingChooseService(services, data.clinic);
      if (services.length > 10) {
        console.warn('BOOKING_SPECIALTY_SERVICE_LIST_LIMIT_EXCEEDED', {
          specialtyId: selection.specialtyId,
          serviceCount: services.length,
        });
        return reply;
      }
      return serviceListReply(reply, services, policy);
    }

    case 'service': {
      if (booking.specialtyId == null) {
        booking.step = 'specialty';
        return specialtyListReply(
          policy.specialties(bookingSpecialties(data), data.clinic),
          data,
          policy
        );
      }
      const availableServices = servicesForSpecialty(
        compatibleBookableServices(data),
        booking.specialtyId
      );
      const service = findServiceSelection(
        interactiveReplyId,
        text,
        availableServices,
        policy
      );
      if (service) {
        return advanceFromServiceSelection(booking, service, data, policy, text);
      }
      const reply = bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingChooseService(availableServices, data.clinic),
      });
      return serviceListReply(reply, availableServices, policy);
    }

    case 'city': {
      const serviceBranches = compatibleBranches(data, booking.serviceId);
      const cities = availableCities(serviceBranches, policy);
      const hasCityReplyId = typeof interactiveReplyId === 'string' &&
        interactiveReplyId.startsWith('city:');
      const directBranch = hasCityReplyId
        ? null
        : findBranchSelection(null, text, serviceBranches, policy);
      if (directBranch) {
        booking.city = directBranch.city || null;
        booking.branchId = directBranch.id;
        booking.date = null;
        booking.datePeriod = null;
        booking.timePeriod = null;
        booking.step = 'date_period';
        return bookingDatePeriodListReply({
          booking,
          data,
          policy,
          bookingEngine,
          bookingContext,
          now,
        });
      }
      const selectedCity = findCitySelection(
        interactiveReplyId,
        text,
        cities,
        policy
      );
      if (selectedCity) {
        transitionBookingSelection(booking, 'city', selectedCity);
        booking.step = 'branch';
        const branches = branchesForCity(serviceBranches, selectedCity, policy);
        return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
      }
      return cityListReply(policy.bookingChooseCity(cities), cities, policy);
    }

    case 'branch': {
      const candidates = branchesForCity(
        compatibleBranches(data, booking.serviceId),
        booking.city,
        policy
      );
      const branch = findBranchSelection(
        interactiveReplyId,
        text,
        candidates,
        policy
      );
      if (branch) {
        transitionBookingSelection(
          booking,
          'city',
          branch.city || booking.city
        );
        transitionBookingSelection(booking, 'branchId', branch.id);
        booking.step = 'date_period';
        return bookingDatePeriodListReply({
          booking,
          data,
          policy,
          bookingEngine,
          bookingContext,
          now,
        });
      }
      return branchListReply(bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingChooseBranch(candidates),
      }), candidates, policy);
    }

    case 'doctor':
      return policy.bookingAskAvailability();

    case 'date_period':
      return handleBookingDatePeriodStep({
        text,
        interactiveReplyId,
        booking,
        data,
        policy,
        bookingEngine,
        bookingContext,
        now,
      });

    case 'date':
      return handleBookingDateStep({
        text,
        interactiveReplyId,
        booking,
        data,
        policy,
        bookingEngine,
        bookingContext,
        now,
      });

    case 'time_period':
      return handleBookingTimePeriodStep({
        text,
        interactiveReplyId,
        booking,
        data,
        policy,
        bookingEngine,
        bookingContext,
        now,
      });

    case 'time':
      return handleBookingTimeStep({
        text,
        interactiveReplyId,
        booking,
        data,
        policy,
        bookingEngine,
        bookingContext,
        now,
      });

    case 'availability': {
      const branch = findById(data.branches, booking.branchId);
      const alternative = parseBookingAlternativeReply(
        interactiveReplyId,
        policy,
        branch,
        now
      );
      if (alternative) {
        booking.preferredStart = alternative.value;
        return validateEarlyAvailability({
          booking,
          data,
          policy,
          bookingEngine,
          bookingContext,
          parsedAvailability: alternative,
          recoverAlternatives: true,
        });
      }
      if (typeof interactiveReplyId === 'string') {
        return policy.bookingAskAvailability();
      }
      const availability = parseBookingPreferredStart(
        text,
        booking.preferredStart,
        policy,
      { timeZone: branch?.timezone || DEFAULT_TIME_ZONE, now }
      );
      if (availability.complete) {
        booking.preferredStart = availability.value;
        return validateEarlyAvailability({
          booking,
          data,
          policy,
          bookingEngine,
          bookingContext,
          parsedAvailability: availability,
        });
      }
      if (availability.partial) {
        booking.preferredStart = availability.value;
        return availability.ambiguousTime
          ? policy.bookingClarifyTimePeriod()
          : availability.missing === 'time'
            ? policy.bookingAskTime()
            : policy.bookingAskDate();
      }
      return bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: availability.ambiguousTime
          ? policy.bookingClarifyTimePeriod()
          : policy.bookingAskAvailability(),
      });
    }

    case 'patient':
      return paymentMethodReply(policy.bookingChoosePaymentMethod(data.paymentMethods), data.paymentMethods, policy);

    case 'payment_method': {
      const paymentMethod = findNamedSelection(
        text,
        data.paymentMethods,
        policy
      );
      if (paymentMethod) {
        booking.paymentMethodId = paymentMethod.id;
        if (isInsurancePayment(paymentMethod, policy)) {
          booking.step = 'insurance_company';
          return insuranceCompanyReply(
            policy.bookingChooseInsuranceCompany(data.insuranceCompanies),
            data.insuranceCompanies,
            policy
          );
        }
        booking.step = 'confirmation';
        return bookingSummary(policy, data, booking);
      }
      return paymentMethodReply(bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingChoosePaymentMethod(data.paymentMethods),
      }), data.paymentMethods, policy);
    }

    case 'insurance_company': {
      const company = findNamedSelection(
        text,
        data.insuranceCompanies,
        policy
      );
      if (!company) {
        return insuranceCompanyReply(
          policy.bookingChooseInsuranceCompany(data.insuranceCompanies),
          data.insuranceCompanies,
          policy
        );
      }
      booking.insuranceCompanyId = company.id;
      booking.insuranceClassId = null;
      booking.step = 'insurance_class';
      const classes = data.insuranceClasses.filter((item) =>
        item.insuranceCompanyId === company.id && item.isAccepted);
      return insuranceClassReply(
        policy.bookingChooseInsuranceClass(classes),
        classes,
        policy
      );
    }

    case 'insurance_class': {
      const cash = findCashPayment(data.paymentMethods, policy);
      if (cash && isCashSelection(text, policy)) {
        booking.paymentMethodId = cash.id;
        booking.insuranceCompanyId = null;
        booking.insuranceClassId = null;
        booking.step = 'confirmation';
        return bookingSummary(policy, data, booking);
      }
      const insuranceClass = findInsuranceClassSelection(
        text,
        data.insuranceClasses,
        booking.insuranceCompanyId,
        policy
      );
      if (!insuranceClass) {
        const classes = data.insuranceClasses.filter((item) =>
          item.insuranceCompanyId === booking.insuranceCompanyId &&
          item.isAccepted);
        return insuranceClassReply(
          policy.bookingChooseInsuranceClass(classes),
          classes,
          policy
        );
      }
      if (!insuranceClass.isAccepted) {
        return policy.bookingInsuranceClassRejected();
      }
      booking.insuranceClassId = insuranceClass.id;
      booking.step = 'confirmation';
      return bookingSummary(policy, data, booking);
    }

    case 'confirmation': {
      if (typeof interactiveReplyId === 'string') {
        if (interactiveReplyId === 'booking-confirm:yes') {
          return executeConfirmedBooking({
            booking,
            state,
            data,
            policy,
            bookingEngine,
            bookingContext,
            customerName,
          });
        }
        if (interactiveReplyId === 'booking-confirm:cancel') {
          delete state.booking;
          return policy.bookingCancelled();
        }
        return bookingSummary(policy, data, booking);
      }
      if (inquiry?.type === 'booking_cancellation_request') {
        delete state.booking;
        return policy.bookingCancelled();
      }
      const normalized = policy.normalize(text);
      if (['نعم', 'موافق', 'تاكيد', 'اكد'].includes(normalized)) {
        return executeConfirmedBooking({
          booking,
          state,
          data,
          policy,
          bookingEngine,
          bookingContext,
          customerName,
        });
      }
      if (['لا', 'الغاء', 'الغي', 'الغيه', 'رفض', 'غير موافق'].includes(normalized)) {
        delete state.booking;
        return policy.bookingCancelled();
      }
      return bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingAskConfirmation(),
      });
    }

    case 'ready':
      return bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingConfirmed(),
      });

    default:
      return null;
  }
}

function bookingSummary(policy, data, booking) {
  const paymentMethod = findById(data.paymentMethods, booking.paymentMethodId);
  const insurance = isInsurancePayment(paymentMethod || {}, policy);
  const insuranceCompany = findById(data.insuranceCompanies, booking.insuranceCompanyId);
  const insuranceClass = findById(data.insuranceClasses, booking.insuranceClassId);
  if (insurance && !insuranceCompany) {
    booking.step = 'insurance_company';
    booking.insuranceCompanyId = null;
    booking.insuranceClassId = null;
    return insuranceCompanyReply(
      policy.bookingChooseInsuranceCompany(data.insuranceCompanies),
      data.insuranceCompanies,
      policy
    );
  }
  if (insurance && !insuranceClass) {
    booking.step = 'insurance_class';
    booking.insuranceClassId = null;
    const classes = data.insuranceClasses.filter((item) =>
      item.insuranceCompanyId === insuranceCompany.id && item.isAccepted);
    return insuranceClassReply(
      policy.bookingChooseInsuranceClass(classes),
      classes,
      policy
    );
  }
  return bookingConfirmationReply(policy.bookingConfirmationSummary({
    service: findById(data.services, booking.serviceId),
    branch: findById(data.branches, booking.branchId),
    preferredStart: booking.preferredStart,
    paymentMethod,
    insuranceCompany: insurance ? insuranceCompany : null,
    insuranceClass: insurance ? insuranceClass : null,
  }));
}

function bookingConfirmationReply(reply) {
  return {
    reply,
    interaction: {
      version: 1,
      mode: 'reply_buttons',
      purpose: 'confirm_booking',
      displayText: 'راجعي تفاصيل الحجز ثم اختاري:',
      options: [
        { id: 'booking-confirm:yes', label: 'تأكيد الحجز' },
        { id: 'booking-confirm:cancel', label: 'إلغاء' },
      ],
    },
  };
}

async function validateEarlyAvailability({
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  parsedAvailability,
  recoverAlternatives = false,
  candidateDoctorId = null,
  candidateRoomId = null,
  persistAssignedResources = false,
}) {
  if (!bookingEngine || typeof bookingEngine.checkAvailability !== 'function') {
    return policy.bookingAvailabilityCheckFailed();
  }
  let result;
  try {
    result = await bookingEngine.checkAvailability({
      clinicId: bookingContext?.clinicId || null,
      service: { id: booking.serviceId },
      branch: { id: booking.branchId },
      doctor: candidateDoctorId || booking.doctorId
        ? { id: candidateDoctorId || booking.doctorId }
        : null,
      room: candidateRoomId ? { id: candidateRoomId } : null,
      availability: { preferredStart: booking.preferredStart },
    });
  } catch (error) {
    console.error('BOOKING_AVAILABILITY_CHECK_FAILED', { code: error?.code || null });
    return policy.bookingAvailabilityCheckFailed();
  }
  if (result.status === 'available') {
    if (persistAssignedResources) {
      booking.doctorId = result.doctor?.id || candidateDoctorId || booking.doctorId;
      booking.roomId = result.room?.id || candidateRoomId || null;
    }
    if (booking.paymentMethodId !== null) {
      booking.step = 'confirmation';
      return bookingSummary(policy, data, booking);
    }
    booking.step = 'payment_method';
    return paymentMethodReply(
      policy.bookingChoosePaymentMethod(data.paymentMethods),
      data.paymentMethods,
      policy
    );
  }
  const reason = result.metadata?.reasonCode || result.reason || 'technical_failure';
  const rejectedReply = policy.bookingAvailabilityRejected({
    reason,
    branch: findById(data.branches, booking.branchId),
  });
  const requestedStart = booking.preferredStart;
  booking.step = 'availability';
  booking.preferredStart = preferredStartAfterRejection(reason, parsedAvailability);
  if (!recoverAlternatives) return rejectedReply;
  const alternatives = await loadAvailableBookingAlternatives({
    booking,
    data,
    bookingEngine,
    bookingContext,
    preferredStart: requestedStart,
  });
  return alternatives.length
    ? bookingAlternativesReply(rejectedReply, alternatives)
    : rejectedReply;
}

function availabilityPreferenceRecoveryReply(result, booking, data, now) {
  const branch = findById(data.branches, booking.branchId);
  const timeZone = branch?.timezone || DEFAULT_TIME_ZONE;
  const tomorrow = addIsoDays(localIsoDate(now, timeZone), 1);
  const requestedDay = result.date === tomorrow
    ? 'غدًا'
    : formatDatePart(result.date, timeZone, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  if (result.unavailableReason === 'closed_day') {
    const weekday = formatDatePart(result.date, timeZone, { weekday: 'long' });
    const day = result.date === tomorrow ? `غدًا ${weekday}` : requestedDay;
    return `${day} والعيادة مغلقة. هذه أقرب المواعيد المتاحة بعد ذلك:`;
  }
  return `لا توجد مواعيد متاحة ${requestedDay}. هذه أقرب المواعيد المتاحة بعد ذلك:`;
}

function preferredStartAfterRejection(reason, parsed) {
  if (['branch_closed', 'clinic_holiday'].includes(reason)) {
    return `time:${pad(parsed.time.hour)}:${pad(parsed.time.minute)}`;
  }
  return `date:${parsed.date.year}-${pad(parsed.date.month)}-${pad(parsed.date.day)}`;
}

async function executeConfirmedBooking({
  booking,
  state,
  data,
  policy,
  bookingEngine,
  bookingContext,
  customerName,
}) {
  if (!bookingEngine || typeof bookingEngine.execute !== 'function') {
    return policy.bookingPersistenceFailed();
  }
  const patient = bookingContext?.patientId
    ? { id: bookingContext.patientId }
    : {
      phoneNumber: bookingContext?.channelIdentity || null,
      fullName: customerName,
    };
  const command = {
    clinicId: bookingContext?.clinicId || null,
    conversationId: bookingContext?.conversationId || null,
    channel: bookingContext?.channel || null,
    channelIdentity: bookingContext?.channelIdentity || null,
    service: { id: booking.serviceId },
    branch: { id: booking.branchId },
    doctor: booking.doctorId ? { id: booking.doctorId } : null,
    room: booking.roomId ? { id: booking.roomId } : null,
    availability: { preferredStart: booking.preferredStart },
    patient,
    appointment: {
      paymentMethodId: booking.paymentMethodId,
      confirmed: true,
    },
    metadata: {
      insuranceCompanyId: booking.insuranceCompanyId,
      insuranceClassId: booking.insuranceClassId,
    },
  };

  let result;
  try {
    result = await bookingEngine.execute(command);
} catch (error) {
    console.error('BOOKING ERROR:', error);
    console.error(error.stack);

    return policy.bookingPersistenceFailed();
}

  if (result.status === 'completed' && result.type === 'booking_created') {
    delete state.booking;
    const appointment = result.appointment || null;
    const catalogService = findById(data.services, booking.serviceId);
    const catalogBranch = findById(data.branches, booking.branchId);
    if (!appointment?.booking_reference) console.error('BOOKING_PRESENTATION_REFERENCE_MISSING', { appointment: '[redacted]' });
    const persistedPayment = appointment?.payment_method_name
      ? { name: appointment.payment_method_name, code: appointment.payment_method_code || null }
      : findById(data.paymentMethods, booking.paymentMethodId);
    if (isInsurancePayment(persistedPayment || {}, policy) && (!appointment?.insurance_company_name || !appointment?.insurance_class_name)) {
      console.error('BOOKING_PRESENTATION_INSURANCE_INCOMPLETE', { appointment: '[redacted]' });
    }
    const resolvedPatientName = appointment?.patient_name ||
      result.patient?.full_name || result.patient?.fullName ||
      booking.patientName || customerName || null;
    const resolvedBookingReference = appointment?.booking_reference ||
      result.references?.[0] || null;
    return {
      reply: policy.bookingCreated({
      service: appointment?.service_name
        ? { ...catalogService, name: appointment.service_name }
        : catalogService,
      branch: appointment?.branch_name
        ? { ...catalogBranch, name: appointment.branch_name }
        : catalogBranch,
      doctor: appointment?.doctor_name
        ? { name: appointment.doctor_name }
        : null,
      room: appointment?.room_number || appointment?.room_name
        ? {
          number: appointment.room_number || null,
          name: appointment.room_name || null,
        }
        : result.room,
      paymentMethod: persistedPayment,
      insuranceCompany: appointment?.insurance_company_name
        ? { name: appointment.insurance_company_name }
        : null,
      insuranceClass: appointment?.insurance_class_name
        ? { name: appointment.insurance_class_name }
        : null,
      preferredStart: appointment?.appointment_start || booking.preferredStart,
      appointment,
      customerName: resolvedPatientName,
      bookingReference: resolvedBookingReference,
      quotedPrice: appointment?.quoted_price ?? null,
      currency: appointment?.currency ?? null,
      }),
      lifecycleTerminalReason: 'completed',
    };
  }
  if (result.status === 'unavailable') {
    booking.step = 'availability';
    const parsed = parsePartialPreferredStart(booking.preferredStart);
    booking.preferredStart = parsed.date
      ? `date:${parsed.date.year}-${pad(parsed.date.month)}-${pad(parsed.date.day)}`
      : null;
    return policy.bookingAvailabilityRejected({
      reason: result.metadata?.reasonCode || result.reason,
      branch: findById(data.branches, booking.branchId),
    });
  }
  return policy.bookingPersistenceFailed(result.reason);
}

function isInsurancePayment(paymentMethod, policy) {
  const value = policy.normalize(
    `${paymentMethod.code || ''} ${paymentMethod.name || ''}`
  );
  return value.includes('insurance') || value.includes('تامين');
}

function findCashPayment(methods, policy) {
  return methods.find((method) => {
    const value = policy.normalize(
      `${method.code || ''} ${method.name || ''} ${policy.display(method.name)}`
    );
    return value.includes('cash') || value.includes('كاش') ||
      value.includes('نقد');
  }) || null;
}

function isCashSelection(text, policy) {
  const value = policy.normalize(text);
  return ['cash', 'كاش', 'نقد', 'نقدي'].includes(value);
}

function findInsuranceClassSelection(text, classes, companyId, policy) {
  const needle = policy.normalize(text).replace(/^(class|فئه)\s+/, '');
  return classes.find((item) => {
    if (item.insuranceCompanyId !== companyId) return false;
    const name = policy.normalize(item.name);
    const shortName = name.replace(/^(class|فئه)\s+/, '');
    return name === policy.normalize(text) || shortName === needle;
  }) || null;
}

function bookingKnowledgeOrReminder({
  inquiry,
  data,
  state,
  policy,
  replyFor,
  customerName,
  reminder,
}) {
  if (!isKnowledgeInquiry(inquiry?.type)) return reminder;
  const answer = replyFor(inquiry, data, customerName);
  return `${answer}\n\n${reminder}`;
}

function normalizeEngineReply(result, nextState) {
  if (
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    Object.prototype.hasOwnProperty.call(result, 'reply')
  ) {
    return {
      reply: result.reply,
      nextState,
      ...(result.interaction ? { interaction: result.interaction } : {}),
      ...(result.notificationAttempted
        ? { notificationAttempted: true }
        : {}),
      ...lifecycleMetadataFrom(result),
    };
  }
  return { reply: result, nextState };
}

function normalizeFlowReply(result, nextState, owner) {
  const normalized = normalizeEngineReply(result, nextState);
  const activeFlow = nextState?.[owner];
  const terminalReason = result && typeof result === 'object'
    ? result.lifecycleTerminalReason
    : null;
  normalized.lifecycleOutcome = activeFlow
    ? {
      lifecycleVersion: 1,
      type: 'continue',
      owner,
      nextStep: activeFlow.step,
      reason: null,
    }
    : {
      lifecycleVersion: 1,
      type: 'terminal',
      owner,
      nextStep: null,
      reason: terminalReason || 'aborted',
    };
  return normalized;
}

function normalizeLegacyReply(result, nextState) {
  const normalized = normalizeEngineReply(result, nextState);
  normalized.undeclaredLifecycleReason = 'legacy_undeclared';
  return normalized;
}

function legacyEngineResult(result) {
  return {
    ...result,
    undeclaredLifecycleReason: 'legacy_undeclared',
  };
}

function paymentMethodReply(reply, paymentMethods, policy) {
  const options = paymentMethods.map((paymentMethod) => ({
    id: String(paymentMethod?.id ?? ''),
    label: policy.display(paymentMethod?.name),
  }));
  if (
    options.length < 1 ||
    options.length > 3 ||
    options.some((option) => !option.id.trim() || !option.label.trim())
  ) return reply;

  return {
    reply,
    interaction: {
      version: 1,
      mode: 'reply_buttons',
      purpose: 'select_payment_method',
      displayText: '💳 اختاري طريقة الدفع.',
      options,
    },
  };
}

function serviceListReply(reply, services, policy) {
  if (!Array.isArray(services)) return { reply };
  const options = services.map((service) => ({
    id: `service:${String(service?.id ?? '')}`,
    label: policy.display(service?.name),
  }));
  const ids = new Set(options.map((option) => option.id));
  if (
    options.length < 1 ||
    options.length > 10 ||
    ids.size !== options.length ||
    options.some((option) =>
      option.id === 'service:' ||
      option.id.length > 200 ||
      !option.label.trim() ||
      option.label.length > 24
    )
  ) return { reply };

  return {
    reply,
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_service',
      displayText: '💎 اختاري الخدمة:',
      listPrompt: 'عرض الخدمات',
      options,
    },
  };
}

function cityListReply(reply, cities, policy) {
  if (!Array.isArray(cities)) return { reply };
  const options = cities.map((city) => ({
    id: cityReplyId(city, policy),
    label: policy.display(city),
  }));
  if (
    options.length < 1 ||
    options.length > 10 ||
    new Set(options.map(({ id }) => id)).size !== options.length ||
    options.some(({ id, label }) =>
      id === 'city:' || id.length > 200 || !label.trim() || label.length > 24
    )
  ) {
    console.warn('BOOKING_CITY_LIST_FALLBACK', {
      cityCount: options.length,
    });
    return { reply };
  }
  return {
    reply,
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_city',
      displayText: '🏙️ اختاري المدينة:',
      listPrompt: 'عرض المدن',
      options,
    },
  };
}

function branchListReply(reply, branches, policy) {
  if (!Array.isArray(branches)) return { reply };
  const uniqueBranches = new Map();
  for (const branch of branches) {
    const id = String(branch?.id ?? '');
    if (id && !uniqueBranches.has(id)) uniqueBranches.set(id, branch);
  }
  const options = [...uniqueBranches.values()].map((branch) => ({
    id: `branch:${String(branch.id)}`,
    label: policy.display(policy.cleanBranchName(branch.name)),
  }));
  if (
    options.length < 1 ||
    options.length > 10 ||
    options.some(({ id, label }) =>
      id === 'branch:' || id.length > 200 || !label.trim() || label.length > 24
    )
  ) {
    console.warn('BOOKING_BRANCH_LIST_FALLBACK', {
      branchCount: options.length,
    });
    return { reply };
  }
  return {
    reply,
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_branch',
      displayText: '📍 اختاري الفرع:',
      listPrompt: 'عرض الفروع',
      options,
    },
  };
}

async function bookingDatePeriodListReply({
  booking,
  data,
  bookingEngine,
  bookingContext,
  now,
}) {
  const dates = await loadAvailableBookingDates({
    booking,
    data,
    bookingEngine,
    bookingContext,
    now,
  });
  const branch = findById(data.branches, booking.branchId);
  return datePeriodListReply(availableDatePeriods(dates, branch, now));
}

async function handleBookingDatePeriodStep({
  text,
  interactiveReplyId,
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  now,
}) {
  const branch = findById(data.branches, booking.branchId);
  const dates = await loadAvailableBookingDates({
    booking,
    data,
    bookingEngine,
    bookingContext,
    now,
  });
  const periods = availableDatePeriods(dates, branch, now);
  const selected = typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('date-period:')
    ? interactiveReplyId.slice('date-period:'.length)
    : null;
  if (periods.some(({ id }) => id === selected)) {
    booking.datePeriod = selected;
    booking.step = 'date';
    return dateListReply(
      dates.filter((date) => dateInPeriod(date, selected)),
      branch,
      now
    );
  }
  if (typeof interactiveReplyId === 'string') {
    return datePeriodListReply(periods);
  }
  try {
    const parsed = parseBookingPreferredStart(text, null, policy, {
      timeZone: branch?.timezone || DEFAULT_TIME_ZONE,
      now,
    });
    if (parsed.complete) {
      booking.preferredStart = parsed.value;
      return validateEarlyAvailability({
        booking,
        data,
        policy,
        bookingEngine,
        bookingContext,
        parsedAvailability: parsed,
        recoverAlternatives: true,
      });
    }
    if (parsed.partial && parsed.date) {
      return handleBookingDateStep({
        text,
        interactiveReplyId: `date:${isoDate(parsed.date)}`,
        booking,
        data,
        policy,
        bookingEngine,
        bookingContext,
        now,
      });
    }
  } catch (error) {
    console.error('BOOKING_DATE_PERIOD_PARSE_FAILED', { code: error?.code || null });
  }
  return datePeriodListReply(periods);
}

async function handleBookingDateStep({
  text,
  interactiveReplyId,
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  now,
}) {
  const branch = findById(data.branches, booking.branchId);
  const dates = await loadAvailableBookingDates({
    booking,
    data,
    bookingEngine,
    bookingContext,
    now,
  });
  if (!dates.length) return dateListReply(dates, branch, now);
  const parsed = parseBookingPreferredStart(
    text,
    null,
    policy,
    { timeZone: branch?.timezone || 'Asia/Riyadh', now }
  );
  const replyDate = typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('date:')
    ? interactiveReplyId.slice('date:'.length)
    : parsed.date
      ? isoDate(parsed.date)
      : null;
  const periodDates = booking.datePeriod
    ? dates.filter((date) => dateInPeriod(date, booking.datePeriod))
    : dates;
  const interactiveDate = typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('date:');
  const validDate = dates.includes(replyDate) &&
    (!interactiveDate || periodDates.includes(replyDate));
  if (!replyDate || !validDate) {
    return dateListReply(periodDates, branch, now);
  }
  booking.date = replyDate;
  booking.datePeriod = null;
  booking.timePeriod = null;
  if (parsed.complete) {
    booking.preferredStart = parsed.value;
    return validateEarlyAvailability({
      booking,
      data,
      policy,
      bookingEngine,
      bookingContext,
      parsedAvailability: parsed,
    });
  }
  booking.preferredStart = null;
  booking.step = 'time_period';
  return bookingTimePeriodListReply({
    booking,
    data,
    bookingEngine,
    bookingContext,
  });
}

async function loadAvailableBookingDates({
  booking,
  data,
  bookingEngine,
  bookingContext,
  now,
}) {
  if (!bookingEngine || typeof bookingEngine.getAvailableDates !== 'function') {
    return [];
  }
  const branch = findById(data.branches, booking.branchId);
  if (!branch) return [];
  const timeZone = branch.timezone || DEFAULT_TIME_ZONE;
  const fromDate = localIsoDate(now, timeZone);
  const searchDays = daysRemainingInMonth(fromDate);
  try {
    const result = await bookingEngine.getAvailableDates({
      clinicId: bookingContext?.clinicId || data.clinic.id || null,
      service: { id: booking.serviceId },
      branch: { id: booking.branchId },
      doctor: booking.doctorId ? { id: booking.doctorId } : null,
      fromDate,
      searchDays,
      limit: searchDays,
    });
    return Array.isArray(result?.dates)
      ? result.dates.filter((date) =>
        isIsoDate(date) && date >= fromDate && sameIsoMonth(date, fromDate)
      )
      : [];
  } catch (error) {
    console.error('BOOKING_AVAILABLE_DATES_FAILED', {
      code: error?.code || null,
    });
    return [];
  }
}

async function bookingTimePeriodListReply(context) {
  const times = await loadAvailableBookingTimes(context);
  return timePeriodListReply(availableTimePeriods(times));
}

async function handleBookingTimePeriodStep({
  text,
  interactiveReplyId,
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  now,
}) {
  const times = await loadAvailableBookingTimes({
    booking,
    data,
    bookingEngine,
    bookingContext,
  });
  const parsedTime = parseSelectedBookingTime(text, booking, data, policy, now);
  if (parsedTime && times.includes(parsedTime.time)) {
    return acceptBookingTime({
      time: parsedTime.time,
      parsedAvailability: parsedTime.parsed,
      booking,
      data,
      policy,
      bookingEngine,
      bookingContext,
    });
  }
  const periods = availableTimePeriods(times);
  const selected = typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('time-period:')
    ? interactiveReplyId.slice('time-period:'.length)
    : null;
  if (!periods.some(({ id }) => id === selected)) {
    return timePeriodListReply(periods);
  }
  booking.timePeriod = selected;
  booking.step = 'time';
  return timeListReply(timePeriodSlots(times, selected));
}

async function handleBookingTimeStep({
  text,
  interactiveReplyId,
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  now,
}) {
  const times = await loadAvailableBookingTimes({
    booking,
    data,
    bookingEngine,
    bookingContext,
  });
  const interactiveTime = typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('time:')
    ? interactiveReplyId.slice('time:'.length)
    : null;
  const parsedTime = interactiveTime
    ? parseSelectedBookingTime(interactiveTime, booking, data, policy, now)
    : parseSelectedBookingTime(text, booking, data, policy, now);
  const periodTimes = booking.timePeriod
    ? timePeriodSlots(times, booking.timePeriod)
    : times;
  const valid = parsedTime && times.includes(parsedTime.time) &&
    (!interactiveTime || periodTimes.includes(parsedTime.time));
  if (!valid) return timeListReply(periodTimes);
  return acceptBookingTime({
    time: parsedTime.time,
    parsedAvailability: parsedTime.parsed,
    booking,
    data,
    policy,
    bookingEngine,
    bookingContext,
  });
}

async function acceptBookingTime({
  parsedAvailability,
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
}) {
  booking.preferredStart = parsedAvailability.value;
  const selectedPeriod = booking.timePeriod;
  booking.timePeriod = null;
  const result = await validateEarlyAvailability({
    booking,
    data,
    policy,
    bookingEngine,
    bookingContext,
    parsedAvailability,
  });
  if (booking.step !== 'availability') return result;
  booking.preferredStart = null;
  booking.timePeriod = selectedPeriod;
  booking.step = 'time';
  const times = await loadAvailableBookingTimes({
    booking,
    data,
    bookingEngine,
    bookingContext,
  });
  return prependReply(
    'عذرًا، الوقت المختار لم يعد متاحًا. اختاري وقتًا آخر. 🌸',
    timeListReply(timePeriodSlots(times, selectedPeriod))
  );
}

function parseSelectedBookingTime(text, booking, data, policy, now) {
  const branch = findById(data.branches, booking.branchId);
  const parsed = parseBookingPreferredStart(
    text,
    booking.date ? `date:${booking.date}` : null,
    policy,
    { timeZone: branch?.timezone || DEFAULT_TIME_ZONE, now }
  );
  if (!parsed.complete) return null;
  return {
    parsed,
    time: `${pad(parsed.time.hour)}:${pad(parsed.time.minute)}`,
  };
}

function parseBookingAlternativeReply(interactiveReplyId, policy, branch, now) {
  const match = String(interactiveReplyId || '').match(
    /^booking-alternative:(\d{4}-\d{2}-\d{2})T([0-2]\d:[0-5]\d)$/
  );
  if (!match) return null;
  const parsed = parseBookingPreferredStart(
    `${match[1]} ${match[2]}`,
    null,
    policy,
    { timeZone: branch?.timezone || DEFAULT_TIME_ZONE, now }
  );
  return parsed.complete ? parsed : null;
}

async function handleBookingAvailabilityPreference({
  preference,
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  now,
}) {
  if (
    preference.type === 'any_time' && !preference.date ||
    !bookingEngine || typeof bookingEngine.getPreferredAvailability !== 'function'
  ) {
    return policy.bookingAskAvailability();
  }
  let result;
  try {
    result = await bookingEngine.getPreferredAvailability({
      clinicId: bookingContext?.clinicId || data.clinic.id || null,
      service: { id: booking.serviceId },
      branch: { id: booking.branchId },
      doctor: booking.doctorId ? { id: booking.doctorId } : null,
      mode: preference.type,
      date: preference.date
        ? `${preference.date.year}-${pad(preference.date.month)}-${pad(preference.date.day)}`
        : null,
      from: now.toISOString(),
    });
  } catch (error) {
    console.error('BOOKING_PREFERRED_AVAILABILITY_FAILED', { code: error?.code || null });
    return policy.bookingAskAvailability();
  }
  if (result?.success === true && result.preferredStart && result.date && result.time) {
    const branch = findById(data.branches, booking.branchId);
    const parsed = parseBookingPreferredStart(
      `${result.date} ${result.time}`,
      null,
      policy,
      { timeZone: branch?.timezone || DEFAULT_TIME_ZONE, now }
    );
    if (!parsed.complete || parsed.value !== result.preferredStart) {
      return policy.bookingAskAvailability();
    }
    booking.preferredStart = result.preferredStart;
    return validateEarlyAvailability({
      booking,
      data,
      policy,
      bookingEngine,
      bookingContext,
      parsedAvailability: parsed,
      recoverAlternatives: true,
      candidateDoctorId: result.doctorId || null,
      candidateRoomId: result.roomId || null,
      persistAssignedResources: true,
    });
  }
  if (preference.type !== 'any_time' || !result?.recoveryStart) {
    return policy.bookingAskAvailability();
  }
  const rejectedReply = policy.bookingAvailabilityRejected({
    reason: 'slot_not_available',
    branch: findById(data.branches, booking.branchId),
  });
  booking.step = 'availability';
  booking.preferredStart = `date:${result.date}`;
  const alternatives = await loadAvailableBookingAlternatives({
    booking,
    data,
    bookingEngine,
    bookingContext,
    preferredStart: result.recoveryStart,
  });
  return alternatives.length
    ? bookingAlternativesReply(
      availabilityPreferenceRecoveryReply(result, booking, data, now),
      alternatives
    )
    : rejectedReply;
}

async function loadAvailableBookingAlternatives({
  booking,
  data,
  bookingEngine,
  bookingContext,
  preferredStart,
}) {
  if (!bookingEngine || typeof bookingEngine.getAvailableAlternatives !== 'function') {
    return [];
  }
  try {
    const result = await bookingEngine.getAvailableAlternatives({
      clinicId: bookingContext?.clinicId || data.clinic.id || null,
      service: { id: booking.serviceId },
      branch: { id: booking.branchId },
      doctor: booking.doctorId ? { id: booking.doctorId } : null,
      preferredStart,
      limit: 3,
    });
    return Array.isArray(result?.alternatives)
      ? result.alternatives.filter(({ date, time }) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && isTimeValue(time)
      ).slice(0, 3)
      : [];
  } catch (error) {
    console.error('BOOKING_ALTERNATIVES_FAILED', { code: error?.code || null });
    return [];
  }
}

function bookingAlternativesReply(reply, alternatives) {
  return {
    reply: `${reply}\n\nاختاري أحد المواعيد البديلة المتاحة:`,
    interaction: {
      version: 1,
      mode: 'reply_buttons',
      purpose: 'select_booking_alternative',
      displayText: 'اختاري موعدًا بديلًا:',
      options: alternatives.map(({ date, time }) => ({
        id: `booking-alternative:${date}T${time}`,
        label: `${date.slice(5).replace('-', '/')} ${displayTime(time)}`,
      })),
    },
  };
}

async function loadAvailableBookingTimes({
  booking,
  data,
  bookingEngine,
  bookingContext,
}) {
  if (!bookingEngine || typeof bookingEngine.getAvailableTimes !== 'function') {
    return [];
  }
  try {
    const result = await bookingEngine.getAvailableTimes({
      clinicId: bookingContext?.clinicId || data.clinic.id || null,
      service: { id: booking.serviceId },
      branch: { id: booking.branchId },
      doctor: booking.doctorId ? { id: booking.doctorId } : null,
      date: booking.date,
    });
    return Array.isArray(result?.times)
      ? [...new Set(result.times.filter(isTimeValue))].sort()
      : [];
  } catch (error) {
    console.error('BOOKING_AVAILABLE_TIMES_FAILED', { code: error?.code || null });
    return [];
  }
}

const TIME_PERIODS = Object.freeze([
  { id: 'morning', label: '🕘 صباح', start: '08:00', end: '11:59' },
  { id: 'noon', label: '🕐 ظهر', start: '12:00', end: '15:59' },
  { id: 'afternoon', label: '🌆 عصر', start: '16:00', end: '18:59' },
  { id: 'evening', label: '🌙 مساء', start: '19:00', end: '23:59' },
]);

function availableTimePeriods(times) {
  const periods = [];
  for (const base of TIME_PERIODS) {
    const matching = times.filter((time) => timeInBasePeriod(time, base));
    const chunks = [];
    for (let index = 0; index < matching.length; index += 10) {
      chunks.push(matching.slice(index, index + 10));
    }
    chunks.forEach((slots, index) => {
      const split = chunks.length > 1;
      periods.push({
        id: split ? `${base.id}-${index + 1}` : base.id,
        label: split
          ? `${base.label} ${index === 0 ? 'مبكر' : 'متأخر'}`
          : base.label,
        start: slots[0],
        end: slots[slots.length - 1],
        slots,
      });
    });
  }
  return periods;
}

function timeInBasePeriod(time, period) {
  return time >= period.start && time <= period.end;
}

function timePeriodSlots(times, periodId) {
  return availableTimePeriods(times).find(({ id }) => id === periodId)?.slots || [];
}

function timePeriodListReply(periods) {
  if (!periods.length) {
    return 'لا توجد مواعيد متاحة في هذا التاريخ حاليًا. 🌸';
  }
  return {
    reply: '🕘 اختاري الفترة الزمنية:',
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_time_period',
      displayText: '🕘 اختاري الفترة الزمنية:',
      listPrompt: 'عرض الفترات',
      options: periods.map(({ id, label, start, end }) => ({
        id: `time-period:${id}`,
        label,
        description: `${start} → ${end}`,
      })),
    },
  };
}

function timeListReply(times) {
  if (!times.length) {
    return 'لا توجد مواعيد متاحة في هذه الفترة حاليًا. 🌸';
  }
  return {
    reply: '🕒 اختاري الوقت:',
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_time',
      displayText: '🕒 اختاري الوقت:',
      listPrompt: 'عرض المواعيد',
      options: times.map((time) => ({
        id: `time:${time}`,
        label: displayTime(time),
      })),
    },
  };
}

function displayTime(time) {
  const [hourText, minute] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour < 12 ? 'ص' : 'م';
  const displayHour = hour % 12 || 12;
  return `${pad(displayHour)}:${minute} ${suffix}`;
}

function isTimeValue(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function prependReply(prefix, response) {
  if (typeof response === 'string') return `${prefix}\n${response}`;
  return { ...response, reply: `${prefix}\n${response.reply}` };
}

function dateListReply(dates, branch, now) {
  if (!dates.length) {
    return 'لا توجد مواعيد متاحة للحجز خلال الشهر الحالي. 🌸';
  }
  const timeZone = branch?.timezone || DEFAULT_TIME_ZONE;
  const today = localIsoDate(now, timeZone);
  const tomorrow = addIsoDays(today, 1);
  return {
    reply: '📅 اختاري التاريخ:',
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_date',
      displayText: '📅 اختاري التاريخ:',
      listPrompt: 'عرض التواريخ',
      options: dates.map((date) => ({
        id: `date:${date}`,
        label: date === today
          ? 'اليوم'
          : date === tomorrow
            ? 'غدًا'
            : formatDatePart(date, timeZone, { weekday: 'long' }),
        description: formatDatePart(date, timeZone, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      })),
    },
  };
}

function datePeriodListReply(periods) {
  if (!periods.length) {
    return 'لا توجد مواعيد متاحة للحجز خلال الشهر الحالي. 🌸';
  }
  return {
    reply: '📅 اختاري الفترة:',
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_date_period',
      displayText: '📅 اختاري الفترة:',
      listPrompt: 'عرض الفترات',
      options: periods.map(({ id, label }) => ({
        id: `date-period:${id}`,
        label,
      })),
    },
  };
}

function availableDatePeriods(dates, branch, now) {
  const timeZone = branch?.timezone || DEFAULT_TIME_ZONE;
  const today = localIsoDate(now, timeZone);
  const monthEnd = daysInIsoMonth(today);
  const periods = [];
  for (let start = 1; start <= monthEnd; start += 10) {
    const end = Math.min(start + 9, monthEnd);
    periods.push({
      id: `${start}-${end}`,
      start,
      end,
      label: start === end ? String(start) : `${start}–${end}`,
    });
  }
  return periods.filter((period) => dates.some((date) =>
    date >= today && sameIsoMonth(date, today) &&
    isoDay(date) >= period.start && isoDay(date) <= period.end
  ));
}

function dateInPeriod(date, period) {
  const match = String(period || '').match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return false;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start < 1 || end < start || end - start >= 10) return false;
  const day = isoDay(date);
  return day >= start && day <= end;
}

function isoDay(date) {
  return Number(String(date).slice(8, 10));
}

function sameIsoMonth(left, right) {
  return String(left).slice(0, 7) === String(right).slice(0, 7);
}

function daysInIsoMonth(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function daysRemainingInMonth(date) {
  return daysInIsoMonth(date) - isoDay(date) + 1;
}

function localIsoDate(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDatePart(date, timeZone, options) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    timeZone,
    ...options,
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isoDate(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addIsoDays(date, count) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function bookingServiceChoiceReply(reply, booking, data, policy) {
  if (booking.specialtyId == null) {
    booking.step = 'specialty';
    return specialtyListReply(
      policy.specialties(bookingSpecialties(data), data.clinic),
      data,
      policy
    );
  }
  booking.step = 'service';
  const services = servicesForSpecialty(
    compatibleBookableServices(data),
    booking.specialtyId
  );
  return serviceListReply(
    reply || policy.bookingChooseService(services, data.clinic),
    services,
    policy
  );
}

function specialtyListReply(reply, data, policy) {
  const specialties = bookingSpecialties(data);
  const options = specialties.map((specialty) => ({
    id: specialty.id === 'uncategorized'
      ? 'specialty:uncategorized'
      : `specialty:${specialty.id}`,
    label: policy.display(specialty.name),
  }));
  const fallbackReason = specialtyListFallbackReason(options);
  if (fallbackReason) {
    console.warn('BOOKING_SPECIALTY_LIST_FALLBACK', {
      reason: fallbackReason,
      specialtyCount: options.length,
    });
    if (options.length > 10) {
      console.warn('BOOKING_SPECIALTY_LIST_LIMIT_EXCEEDED', {
        specialtyCount: options.length,
      });
    }
    return { reply, fallbackReason };
  }
  return {
    reply,
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_specialty',
      displayText: '💎 اختاري التخصص:',
      listPrompt: 'عرض التخصصات',
      options,
    },
  };
}

function specialtyListFallbackReason(options) {
  if (!Array.isArray(options)) return 'EMPTY_ROWS';
  if (options.length < 1) return 'NO_SPECIALTIES';
  if (options.length > 10) return 'TOO_MANY_SPECIALTIES';
  if (new Set(options.map(({ id }) => id)).size !== options.length) {
    return 'DUPLICATE_ROWS';
  }
  if (options.some(({ id }) => !id || id.length > 200)) {
    return 'INVALID_SPECIALTY_ID';
  }
  if (options.some(({ label }) => !label || label.length > 24)) {
    return 'INVALID_TITLE';
  }
  return null;
}

function bookableServices(services) {
  return services.filter((service) => service.isBookingEnabled !== false);
}

function bookingSpecialties(data) {
  const services = compatibleBookableServices(data);
  const usedIds = new Set(
    services
      .map(({ specialtyId }) => normalizedSpecialtyId(specialtyId))
      .filter(Boolean)
  );
  const specialties = data.specialties.filter((specialty) =>
    usedIds.has(String(specialty.id))
  );
  if (services.some(({ specialtyId }) => !normalizedSpecialtyId(specialtyId))) {
    specialties.push({ id: 'uncategorized', name: 'خدمات أخرى' });
  }
  return specialties;
}

function servicesForSpecialty(services, specialtyId) {
  if (specialtyId === 'uncategorized') {
    return services.filter(({ specialtyId: id }) => !normalizedSpecialtyId(id));
  }
  return services.filter(({ specialtyId: id }) =>
    normalizedSpecialtyId(id) === specialtyId
  );
}

function normalizedSpecialtyId(value) {
  if (value === null || value === undefined) return null;
  const id = String(value);
  return id === '00000000-0000-0000-0000-000000000000' ? null : id;
}

function findSpecialtySelection(interactiveReplyId, text, data, policy) {
  const specialties = bookingSpecialties(data);
  if (interactiveReplyId === 'specialty:uncategorized') {
    return {
      matched: specialties.some(({ id }) => id === 'uncategorized'),
      specialtyId: 'uncategorized',
    };
  }
  if (
    typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('specialty:')
  ) {
    const specialtyId = interactiveReplyId.slice('specialty:'.length);
    return {
      matched: specialties.some(({ id }) => String(id) === specialtyId),
      specialtyId,
    };
  }
  const specialty = findNamedSelection(text, specialties, policy);
  return specialty
    ? { matched: true, specialtyId: String(specialty.id) }
    : { matched: false, specialtyId: null };
}

function insuranceCompanyReply(reply, insuranceCompanies, policy) {
  if (!Array.isArray(insuranceCompanies)) return reply;
  const options = insuranceCompanies.map((insuranceCompany) => ({
    id: String(insuranceCompany?.id ?? ''),
    label: policy.display(insuranceCompany?.name),
  }));
  const ids = new Set(options.map((option) => option.id));
  if (
    options.length < 1 ||
    options.length > 10 ||
    ids.size !== options.length ||
    options.some((option) =>
      !option.id.trim() ||
      option.id.length > 200 ||
      !option.label.trim() ||
      option.label.length > 24
    )
  ) return reply;

  return {
    reply,
    interaction: {
      version: 1,
      mode: 'list',
      purpose: 'select_insurance_company',
      displayText: '🛡️ اختاري شركة التأمين.',
      listPrompt: 'عرض الشركات',
      options,
    },
  };
}

function insuranceClassReply(reply, insuranceClasses, policy) {
  if (!Array.isArray(insuranceClasses)) return reply;
  const options = insuranceClasses.map((insuranceClass) => ({
    id: String(insuranceClass?.id ?? ''),
    label: policy.display(insuranceClass?.name),
  }));
  const ids = new Set(options.map((option) => option.id));
  if (
    options.length < 1 ||
    options.length > 3 ||
    ids.size !== options.length ||
    options.some((option) =>
      !option.id.trim() ||
      option.id.length > 256 ||
      !option.label.trim() ||
      option.label.length > 20
    )
  ) return reply;

  return {
    reply,
    interaction: {
      version: 1,
      mode: 'reply_buttons',
      purpose: 'select_insurance_class',
      displayText: '✨ اختاري فئة التأمين.',
      options,
    },
  };
}

function isKnowledgeInquiry(type) {
  return [
    'identity',
    'branches',
    'specialties',
    'services',
    'services_under_specialty',
    'service_exists',
    'payment_methods',
    'insurance_companies',
    'insurance_classes',
    'insurance_class_check',
    'insurance_company_check',
    'working_hours',
    'working_hours_city',
    'working_hours_branch',
    'working_day',
    'branch_address',
    'holiday_day',
  ].includes(type);
}

function findNamedSelection(text, items, policy) {
  const needle = policy.normalize(text);
  if (!needle) return null;
  return items.find((item) => {
    const name = policy.normalize(item.name);
    const displayedName = policy.normalize(policy.display(item.name));
    return name === needle ||
      displayedName === needle ||
      needle.includes(name) ||
      needle.includes(displayedName);
  }) || null;
}

function findServiceSelection(interactiveReplyId, text, services, policy) {
  if (
    typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('service:')
  ) {
    const serviceId = interactiveReplyId.slice('service:'.length);
    return services.find((service) => String(service.id) === serviceId) || null;
  }
  return findNamedSelection(text, services, policy);
}

function findCitySelection(interactiveReplyId, text, cities, policy) {
  if (
    typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('city:')
  ) {
    return cities.find((city) =>
      cityReplyId(city, policy) === interactiveReplyId
    ) || null;
  }
  return cities.find((city) =>
    policy.normalize(city) === policy.normalize(text)
  ) || null;
}

function cityReplyId(city, policy) {
  return `city:${encodeURIComponent(policy.normalize(city))}`;
}

function findBranchSelection(interactiveReplyId, text, branches, policy) {
  if (
    typeof interactiveReplyId === 'string' &&
    interactiveReplyId.startsWith('branch:')
  ) {
    const branchId = interactiveReplyId.slice('branch:'.length);
    return branches.find((branch) => String(branch.id) === branchId) || null;
  }
  const exact = findNamedSelection(text, branches, policy);
  if (exact) return exact;
  const needle = policy.normalize(text)
    .replace(/^فرع\s+/, '')
    .trim();
  if (!needle) return null;
  return branches.find((branch) => {
    const name = policy.normalize(policy.cleanBranchName(branch.name));
    return name === needle ||
      name.includes(needle) ||
      needle.includes(name) ||
      name.split(/[—-]/).some((part) => part.trim() === needle);
  }) || null;
}

function availableCities(branches, policy) {
  const cities = new Map();
  for (const branch of branches) {
    if (!branch.city) continue;
    const key = policy.normalize(branch.city);
    if (key && !cities.has(key)) cities.set(key, branch.city);
  }
  return [...cities.values()];
}

function branchesForCity(branches, city, policy) {
  if (!city) return branches;
  const normalizedCity = policy.normalize(city);
  return branches.filter(branch => policy.normalize(branch.city) === normalizedCity);
}

function findById(items, id) {
  return items.find((item) => item.id === id) || null;
}

function parsePreferredStart(text, previousValue, policy) {
  const normalized = policy.normalize(text);
  const previous = parsePartialPreferredStart(previousValue);
  const date = parseDatePart(normalized) || previous.date;
  const timeValue = parseTimePart(stripExplicitDate(normalized)) || previous.time;

  if (date && timeValue) {
    const value = new Date(
      date.year,
      date.month - 1,
      date.day,
      timeValue.hour,
      timeValue.minute,
      0,
      0
    );
    if (!Number.isNaN(value.getTime())) {
      return { complete: true, value: value.toISOString() };
    }
  }
  if (date) {
    return {
      complete: false,
      partial: true,
      missing: 'time',
      value: `date:${date.year}-${pad(date.month)}-${pad(date.day)}`,
    };
  }
  if (timeValue) {
    return {
      complete: false,
      partial: true,
      missing: 'date',
      value: `time:${pad(timeValue.hour)}:${pad(timeValue.minute)}`,
    };
  }
  return { complete: false, partial: false };
}

function parsePartialPreferredStart(value) {
  if (typeof value !== 'string') return {};
  const dateMatch = value.match(/^date:(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return {
      date: {
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[3]),
      },
    };
  }
  const timeMatch = value.match(/^time:(\d{2}):(\d{2})$/);
  if (timeMatch) {
    return {
      time: {
        hour: Number(timeMatch[1]),
        minute: Number(timeMatch[2]),
      },
    };
  }
  return {};
}

function parseDatePart(text) {
  const now = new Date();
  if (/(^|\s)(اليوم|today)(\s|$)/.test(text)) return dateParts(now);
  if (/(^|\s)(بكره|بكرة|غدا|غداً|tomorrow)(\s|$)/.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return dateParts(tomorrow);
  }
  if (/(^|\s)(weekdays|ايام الاسبوع)(\s|$)/.test(text)) {
    const nextWeekday = new Date(now);
    do {
      nextWeekday.setDate(nextWeekday.getDate() + 1);
    } while ([5, 6].includes(nextWeekday.getDay()));
    return dateParts(nextWeekday);
  }

  const explicit = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/) ||
    text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (explicit) {
    if (explicit[1].length === 4) {
      return validDateParts(
        Number(explicit[1]),
        Number(explicit[2]),
        Number(explicit[3])
      );
    }
    return validDateParts(
      Number(explicit[3]),
      Number(explicit[2]),
      Number(explicit[1])
    );
  }

  const weekdays = [
    ['الاحد', 'sunday'],
    ['الاثنين', 'monday'],
    ['الثلاثاء', 'tuesday'],
    ['الاربعاء', 'wednesday'],
    ['الخميس', 'thursday'],
    ['الجمعه', 'friday'],
    ['السبت', 'saturday'],
  ];
  const weekday = weekdays.findIndex((names) =>
    names.some((name) => text.includes(name))
  );
  if (weekday >= 0) {
    const target = new Date(now);
    let daysAhead = (weekday - now.getDay() + 7) % 7;
    if (daysAhead === 0) daysAhead = 7;
    target.setDate(now.getDate() + daysAhead);
    return dateParts(target);
  }
  return null;
}

function stripExplicitDate(text) {
  return text
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/, ' ');
}

function parseTimePart(text) {
  const match = text.match(
    /(?:الساعه|الساعة|at)?\s*(\d{1,2})(?::(\d{2}))?\s*(صباحا|صباح|am|مساء|مساءا|pm)?/
  );
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3] || null;
  if (hour > 23 || minute > 59) return null;
  if (['مساء', 'مساءا', 'pm'].includes(period) && hour < 12) hour += 12;
  if (['صباحا', 'صباح', 'am'].includes(period) && hour === 12) hour = 0;
  return { hour, minute };
}

function dateParts(value) {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

function validDateParts(year, month, day) {
  const value = new Date(year, month - 1, day);
  if (
    value.getFullYear() !== year ||
    value.getMonth() + 1 !== month ||
    value.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizeState(state, policy) {
  if (!state || typeof state !== 'object' || state.version !== 1) return policy.initialState();
  const normalized = { version: 1, mode: 'idle', step: state.step === 'customer_name' ? 'customer_name' : null, customer: { name: typeof state.customer?.name === 'string' && state.customer.name.trim() ? state.customer.name.trim() : null }, context: state.context && typeof state.context === 'object' ? structuredClone(state.context) : null, options: [] };
  const booking = normalizeBookingState(state);
  if (booking) normalized.booking = booking;
  const priceInquiry = normalizePriceInquiryState(state.priceInquiry);
  if (priceInquiry) normalized.priceInquiry = priceInquiry;
  const cancellation = normalizeCancellationState(state);
  if (cancellation) normalized.cancellation = cancellation;
  const reschedule = normalizeRescheduleState(state.reschedule);
  if (reschedule) normalized.reschedule = reschedule;
  const changeService = normalizeChangeServiceState(state.changeService);
  if (changeService) normalized.changeService = changeService;
  const changeBranch = normalizeChangeBranchState(state.changeBranch);
  if (changeBranch) normalized.changeBranch = changeBranch;
  return normalized;
}

const CHANGE_SERVICE_STEPS = new Set([
  'awaiting_reference', 'awaiting_verification', 'awaiting_appointment',
  'awaiting_service', 'awaiting_date', 'awaiting_time', 'awaiting_confirmation',
]);
const CHANGE_SERVICE_FIELDS = Object.freeze([
  'intent', 'step', 'candidateAppointmentIds', 'selectedAppointmentId',
  'bookingReference', 'verificationRequired', 'ownershipVerified',
  'verificationAttempts', 'targetServiceId', 'availableDates', 'availableTimes',
  'proposedDate', 'proposedStart', 'reviewedUpdatedAt', 'confirmationPending',
]);
function createChangeServiceState({
  verificationRequired = false, targetServiceId = null,
} = {}) {
  return {
    intent: 'appointment_change_service',
    step: verificationRequired ? 'awaiting_reference' : 'awaiting_appointment',
    candidateAppointmentIds: [], selectedAppointmentId: null,
    bookingReference: null, verificationRequired: Boolean(verificationRequired),
    ownershipVerified: false, verificationAttempts: 0,
    targetServiceId: isUuid(targetServiceId) ? targetServiceId : null,
    availableDates: [], availableTimes: [], proposedDate: null,
    proposedStart: null, reviewedUpdatedAt: null, confirmationPending: false,
  };
}
function normalizeChangeServiceState(value) {
  if (!isPlainObject(value) || Object.keys(value).length !== CHANGE_SERVICE_FIELDS.length ||
      Object.keys(value).some((key) => !CHANGE_SERVICE_FIELDS.includes(key)) ||
      value.intent !== 'appointment_change_service' ||
      !CHANGE_SERVICE_STEPS.has(value.step) ||
      !Array.isArray(value.candidateAppointmentIds) ||
      !value.candidateAppointmentIds.every(isUuid) ||
      !isNullableUuid(value.selectedAppointmentId) ||
      !isNullableBookingReference(value.bookingReference) ||
      typeof value.verificationRequired !== 'boolean' ||
      typeof value.ownershipVerified !== 'boolean' ||
      !Number.isInteger(value.verificationAttempts) || value.verificationAttempts < 0 ||
      value.verificationAttempts >= 3 ||
      !isNullableUuid(value.targetServiceId) ||
      !Array.isArray(value.availableDates) || !value.availableDates.every(isIsoDate) ||
      !Array.isArray(value.availableTimes) || !value.availableTimes.every(isClockTime) ||
      !(value.proposedDate === null || isIsoDate(value.proposedDate)) ||
      !(value.proposedStart === null || Number.isFinite(Date.parse(value.proposedStart))) ||
      !(value.reviewedUpdatedAt === null || Number.isFinite(Date.parse(value.reviewedUpdatedAt))) ||
      typeof value.confirmationPending !== 'boolean') return null;
  return structuredClone(value);
}
function clearChangeServiceState(state) {
  if (!state || typeof state !== 'object') return state;
  delete state.changeService;
  state.options = [];
  if (state.step !== 'customer_name') state.step = null;
  if (String(state.context?.inquiry || '').includes('change_service')) state.context = null;
  return state;
}

const CHANGE_BRANCH_STEPS = new Set([
  'awaiting_reference', 'awaiting_verification', 'awaiting_appointment',
  'awaiting_branch', 'awaiting_date', 'awaiting_time', 'awaiting_confirmation',
]);
const CHANGE_BRANCH_FIELDS = Object.freeze([
  'intent', 'step', 'candidateAppointmentIds', 'selectedAppointmentId',
  'bookingReference', 'verificationRequired', 'ownershipVerified',
  'verificationAttempts', 'targetBranchId', 'availableDates', 'availableTimes',
  'proposedDate', 'proposedStart', 'reviewedUpdatedAt', 'confirmationPending',
]);
function createChangeBranchState({ verificationRequired = false, targetBranchId = null } = {}) {
  return {
    intent: 'appointment_change_branch',
    step: verificationRequired ? 'awaiting_reference' : 'awaiting_appointment',
    candidateAppointmentIds: [], selectedAppointmentId: null,
    bookingReference: null, verificationRequired: Boolean(verificationRequired),
    ownershipVerified: false, verificationAttempts: 0,
    targetBranchId: isUuid(targetBranchId) ? targetBranchId : null,
    availableDates: [], availableTimes: [], proposedDate: null,
    proposedStart: null, reviewedUpdatedAt: null, confirmationPending: false,
  };
}
function normalizeChangeBranchState(value) {
  if (!isPlainObject(value) || Object.keys(value).length !== CHANGE_BRANCH_FIELDS.length ||
      Object.keys(value).some((key) => !CHANGE_BRANCH_FIELDS.includes(key)) ||
      value.intent !== 'appointment_change_branch' || !CHANGE_BRANCH_STEPS.has(value.step) ||
      !Array.isArray(value.candidateAppointmentIds) || !value.candidateAppointmentIds.every(isUuid) ||
      !isNullableUuid(value.selectedAppointmentId) || !isNullableBookingReference(value.bookingReference) ||
      typeof value.verificationRequired !== 'boolean' || typeof value.ownershipVerified !== 'boolean' ||
      !Number.isInteger(value.verificationAttempts) || value.verificationAttempts < 0 ||
      value.verificationAttempts >= 3 || !isNullableUuid(value.targetBranchId) ||
      !Array.isArray(value.availableDates) || !value.availableDates.every(isIsoDate) ||
      !Array.isArray(value.availableTimes) || !value.availableTimes.every(isClockTime) ||
      !(value.proposedDate === null || isIsoDate(value.proposedDate)) ||
      !(value.proposedStart === null || Number.isFinite(Date.parse(value.proposedStart))) ||
      !(value.reviewedUpdatedAt === null || Number.isFinite(Date.parse(value.reviewedUpdatedAt))) ||
      typeof value.confirmationPending !== 'boolean') return null;
  return structuredClone(value);
}
function clearChangeBranchState(state) {
  if (!state || typeof state !== 'object') return state;
  delete state.changeBranch;
  state.options = [];
  if (state.step !== 'customer_name') state.step = null;
  if (String(state.context?.inquiry || '').includes('change_branch')) state.context = null;
  return state;
}

const RESCHEDULE_STEPS = new Set([
  'awaiting_reference', 'awaiting_verification', 'awaiting_selection',
  'awaiting_date', 'awaiting_time', 'awaiting_confirmation',
]);
const RESCHEDULE_FIELDS = Object.freeze([
  'intent', 'step', 'candidateAppointmentIds', 'selectedAppointmentId',
  'bookingReference', 'verificationRequired', 'ownershipVerified',
  'verificationAttempts', 'availableDates', 'availableTimes', 'selectedDate',
  'selectedTime', 'confirmationPending', 'dateTimeExpressions',
]);

function createRescheduleState({
  bookingReference = null, verificationRequired = false,
  dateTimeExpressions = [],
} = {}) {
  return {
    intent: 'appointment_reschedule',
    step: verificationRequired ? (bookingReference ? 'awaiting_verification' : 'awaiting_reference') : 'awaiting_selection',
    candidateAppointmentIds: [], selectedAppointmentId: null,
    bookingReference: bookingReference && /^[0-9a-f]{8}$/iu.test(bookingReference)
      ? bookingReference.toUpperCase() : null,
    verificationRequired: Boolean(verificationRequired), ownershipVerified: false,
    verificationAttempts: 0, availableDates: [], availableTimes: [],
    selectedDate: null, selectedTime: null, confirmationPending: false,
    dateTimeExpressions: Array.isArray(dateTimeExpressions)
      ? dateTimeExpressions.filter((value) => typeof value === 'string').slice(0, 2) : [],
  };
}

function normalizeRescheduleState(value) {
  if (!isPlainObject(value) ||
    Object.keys(value).length !== RESCHEDULE_FIELDS.length ||
    Object.keys(value).some((key) => !RESCHEDULE_FIELDS.includes(key)) ||
    value.intent !== 'appointment_reschedule' ||
    !RESCHEDULE_STEPS.has(value.step) ||
    !Array.isArray(value.candidateAppointmentIds) ||
    !value.candidateAppointmentIds.every(isUuid) ||
    !isNullableUuid(value.selectedAppointmentId) ||
    !isNullableBookingReference(value.bookingReference) ||
    typeof value.verificationRequired !== 'boolean' ||
    typeof value.ownershipVerified !== 'boolean' ||
    !Number.isInteger(value.verificationAttempts) || value.verificationAttempts < 0 ||
    value.verificationAttempts >= 3 ||
    !Array.isArray(value.availableDates) || !value.availableDates.every(isIsoDate) ||
    !Array.isArray(value.availableTimes) || !value.availableTimes.every(isClockTime) ||
    !(value.selectedDate === null || isIsoDate(value.selectedDate)) ||
    !(value.selectedTime === null || isClockTime(value.selectedTime)) ||
    typeof value.confirmationPending !== 'boolean' ||
    !Array.isArray(value.dateTimeExpressions) ||
    !value.dateTimeExpressions.every((item) => typeof item === 'string') ||
    (value.selectedAppointmentId !== null &&
      !value.candidateAppointmentIds.includes(value.selectedAppointmentId)) ||
    (value.confirmationPending &&
      (!value.ownershipVerified || !value.selectedAppointmentId ||
        !value.selectedDate || !value.selectedTime))) return null;
  return structuredClone(value);
}

function clearRescheduleState(state) {
  clearAppointmentManagementArtifacts(state, 'reschedule');
}

const EXPLICIT_APPOINTMENT_INTERRUPTS = new Set([
  'booking',
  'booking_cancellation_request',
  'booking_modification_request',
  'change_service_request',
  'change_branch_request',
  'change_provider_request',
  'appointment_query_request',
  'availability_request',
  'cancellation_information_request',
  'appointment_management_clarification',
  'bulk_cancel_request',
  'compound_appointment_request',
]);

function interruptAppointmentManagementFlow(state, inquiry, interactiveReplyId) {
  if (
    interactiveReplyId ||
    !state ||
    !inquiry ||
    !EXPLICIT_APPOINTMENT_INTERRUPTS.has(inquiry.type)
  ) return false;

  const currentFlow = state.cancellation
    ? 'cancellation'
    : state.reschedule
      ? 'reschedule'
      : state.changeService
        ? 'changeService'
        : state.changeBranch
          ? 'changeBranch'
      : null;
  if (!currentFlow) return false;

  const sameWorkflow = currentFlow === 'cancellation'
    ? inquiry.type === 'booking_cancellation_request'
    : currentFlow === 'reschedule'
      ? inquiry.type === 'booking_modification_request'
      : currentFlow === 'changeService'
        ? inquiry.type === 'change_service_request'
        : inquiry.type === 'change_branch_request';
  if (sameWorkflow) return false;

  if (currentFlow === 'changeService') clearChangeServiceState(state);
  else if (currentFlow === 'changeBranch') clearChangeBranchState(state);
  else clearAppointmentManagementArtifacts(state, currentFlow);
  return true;
}

function clearAppointmentManagementArtifacts(state, flow) {
  if (!state || typeof state !== 'object') return state;
  if (flow === 'cancellation') delete state.cancellation;
  if (flow === 'reschedule') delete state.reschedule;
  state.options = [];
  if (state.step !== 'customer_name') state.step = null;
  const inquiry = state.context?.inquiry;
  if (
    inquiry === 'appointment_management_clarification' ||
    String(inquiry || '').includes('cancellation') ||
    String(inquiry || '').includes('reschedule')
  ) state.context = null;
  return state;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isClockTime(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

const MAX_CANCELLATION_VERIFICATION_ATTEMPTS = 3;
const CANCELLATION_STEPS = new Set([
  'awaiting_reference',
  'awaiting_selection',
  'awaiting_verification',
  'awaiting_confirmation',
  'awaiting_reason',
]);
const CANCELLATION_FIELDS = Object.freeze([
  'intent',
  'step',
  'candidateAppointmentIds',
  'selectedAppointmentId',
  'bookingReference',
  'verificationRequired',
  'ownershipVerified',
  'verificationAttempts',
  'confirmationPending',
  'cancellationReason',
  'reviewedUpdatedAt',
]);

function normalizeCancellationState(state) {
  const property = Object.getOwnPropertyDescriptor(state, 'cancellation');
  if (!property || property.get || property.set) return null;
  const cancellation = property.value;
  if (!isPlainObject(cancellation)) return null;
  const keys = Reflect.ownKeys(cancellation);
  if (
    keys.length !== CANCELLATION_FIELDS.length ||
    keys.some((key) =>
      typeof key !== 'string' || !CANCELLATION_FIELDS.includes(key)
    )
  ) {
    return null;
  }

  const values = Object.create(null);
  for (const field of CANCELLATION_FIELDS) {
    const fieldProperty = Object.getOwnPropertyDescriptor(cancellation, field);
    if (!fieldProperty || fieldProperty.get || fieldProperty.set) return null;
    values[field] = fieldProperty.value;
  }

  if (
    values.intent !== 'appointment_cancellation' ||
    !CANCELLATION_STEPS.has(values.step) ||
    !Array.isArray(values.candidateAppointmentIds) ||
    !values.candidateAppointmentIds.every(isUuid) ||
    new Set(values.candidateAppointmentIds).size !==
      values.candidateAppointmentIds.length ||
    !isNullableUuid(values.selectedAppointmentId) ||
    (
      values.selectedAppointmentId !== null &&
      !values.candidateAppointmentIds.includes(values.selectedAppointmentId)
    ) ||
    !isNullableBookingReference(values.bookingReference) ||
    typeof values.verificationRequired !== 'boolean' ||
    typeof values.ownershipVerified !== 'boolean' ||
    !Number.isInteger(values.verificationAttempts) ||
    values.verificationAttempts < 0 ||
    values.verificationAttempts >= MAX_CANCELLATION_VERIFICATION_ATTEMPTS ||
    typeof values.confirmationPending !== 'boolean' ||
    !isNullableNonBlankString(values.cancellationReason) ||
    !isNullableTimestamp(values.reviewedUpdatedAt) ||
    (
      values.confirmationPending &&
      (!values.selectedAppointmentId || !values.ownershipVerified)
    )
  ) {
    return null;
  }

  return {
    intent: 'appointment_cancellation',
    step: values.step,
    candidateAppointmentIds: [...values.candidateAppointmentIds],
    selectedAppointmentId: values.selectedAppointmentId,
    bookingReference: values.bookingReference === null
      ? null
      : values.bookingReference.toUpperCase(),
    verificationRequired: values.verificationRequired,
    ownershipVerified: values.ownershipVerified,
    verificationAttempts: values.verificationAttempts,
    confirmationPending: values.confirmationPending,
    cancellationReason: values.cancellationReason,
    reviewedUpdatedAt: values.reviewedUpdatedAt,
  };
}

function createCancellationState({
  step = 'awaiting_reference',
  bookingReference = null,
  verificationRequired = false,
} = {}) {
  const normalizedReference = typeof bookingReference === 'string' &&
    /^[0-9a-f]{8}$/iu.test(bookingReference)
    ? bookingReference.toUpperCase()
    : null;
  return {
    intent: 'appointment_cancellation',
    step,
    candidateAppointmentIds: [],
    selectedAppointmentId: null,
    bookingReference: normalizedReference,
    verificationRequired: Boolean(verificationRequired),
    ownershipVerified: false,
    verificationAttempts: 0,
    confirmationPending: false,
    cancellationReason: null,
    reviewedUpdatedAt: null,
  };
}

function clearCancellationState(state) {
  return clearAppointmentManagementArtifacts(state, 'cancellation');
}

function replaceCancellationState(state, input = {}) {
  if (state && typeof state === 'object') {
    clearRescheduleState(state);
    state.cancellation = createCancellationState(input);
  }
  return state;
}

function recordCancellationVerificationFailure(state) {
  const cancellation = state?.cancellation;
  if (!cancellation || typeof cancellation !== 'object') return state;
  cancellation.verificationAttempts += 1;
  if (
    cancellation.verificationAttempts >=
    MAX_CANCELLATION_VERIFICATION_ATTEMPTS
  ) {
    clearCancellationState(state);
  }
  return state;
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isNullableUuid(value) {
  return value === null || isUuid(value);
}

function isNullableBookingReference(value) {
  return value === null ||
    (typeof value === 'string' && /^[0-9a-f]{8}$/iu.test(value));
}

function isNullableTimestamp(value) {
  return value === null ||
    (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

const PRICE_STATES = new Set([
  'awaiting_price_service',
  'awaiting_price_payment_method',
  'awaiting_price_insurance_company',
  'awaiting_price_insurance_class',
  'awaiting_price_cash_confirmation',
  'awaiting_price_booking_confirmation',
  'price_inquiry_ready',
]);

function normalizePriceInquiryState(value) {
  if (!isPlainObject(value) || value.intent !== 'price_inquiry' ||
      !PRICE_STATES.has(value.state)) return null;
  const fields = [
    'selected_service_id', 'selected_service_name',
    'selected_payment_method', 'selected_insurance_company_id',
    'selected_insurance_company_name', 'selected_insurance_class_id',
    'selected_insurance_class_name', 'resolved_cash_price',
    'resolved_insurance_price', 'currency',
  ];
  const normalized = { intent: 'price_inquiry', state: value.state };
  for (const field of fields) {
    normalized[field] = typeof value[field] === 'string' && value[field].trim()
      ? value[field].trim()
      : null;
  }
  return normalized;
}

async function handlePriceInquiry({
  text, state, data, policy, priceService, now, bookingContext,
}) {
  let flow = state.priceInquiry;
  if (isExplicitGeneralPriceInquiry(text, policy)) {
    flow = emptyPriceInquiryState();
    state.priceInquiry = flow;
    return priceServiceChoice(data.services, data.clinic, policy);
  }
  if (flow && isPriceInquiry(text, policy)) {
    const requestedText = extractPriceServiceText(text, policy);
    const requestedServices = requestedText
      ? matchingServices(requestedText, data.services, policy)
      : [];
    if (requestedServices.length === 1) {
      flow = emptyPriceInquiryState();
      state.priceInquiry = flow;
      selectPriceService(flow, requestedServices[0]);
      return resolveCashPrice({ flow, data, priceService, now, policy });
    }
    if (!requestedText || isGenericPriceSubject(requestedText, policy)) {
      flow = emptyPriceInquiryState();
      state.priceInquiry = flow;
      return priceServiceChoice(data.services, data.clinic, policy);
    }
    if (requestedServices.length > 1) {
      flow = emptyPriceInquiryState();
      state.priceInquiry = flow;
      return priceServiceChoice(requestedServices, data.clinic, policy);
    }
  }
  if (!flow) {
    flow = emptyPriceInquiryState();
    state.priceInquiry = flow;
    const serviceText = extractPriceServiceText(text, policy);
    if (!serviceText) return priceServiceChoice(data.services, data.clinic, policy);
    const matches = matchingServices(serviceText, data.services, policy);
    if (matches.length !== 1) {
      return matches.length > 1
        ? priceServiceChoice(matches, data.clinic, policy)
        : unknownPriceService(data.services, data.clinic, policy);
    }
    selectPriceService(flow, matches[0]);
    return resolveCashPrice({ flow, data, priceService, now, policy });
  }

  if (!validSelectedService(flow, data.services)) {
    clearPriceSelection(flow);
    const serviceMatches = matchingServices(text, data.services, policy);
    if (serviceMatches.length === 1) {
      selectPriceService(flow, serviceMatches[0]);
      return resolveCashPrice({ flow, data, priceService, now, policy });
    }
    return serviceMatches.length > 1
      ? priceServiceChoice(serviceMatches, data.clinic, policy)
      : priceServiceChoice(data.services, data.clinic, policy);
  }

  if (flow.state === 'awaiting_price_cash_confirmation') {
    if (isAffirmative(text, policy)) {
      flow.selected_payment_method = 'cash';
      flow.selected_insurance_company_id = null;
      flow.selected_insurance_company_name = null;
      flow.selected_insurance_class_id = null;
      flow.selected_insurance_class_name = null;
      flow.resolved_insurance_price = null;
      flow.state = 'awaiting_price_booking_confirmation';
      return cashBookingReply(flow);
    }
    if (isNegative(text, policy)) {
      return 'تمام 🌸 يمكنني عرض خيارات تأمين أخرى أو تحويلك للموظف المختص.';
    }
  }

  if (flow.state === 'awaiting_price_booking_confirmation') {
    if (isBookingConfirmation(text, policy)) {
      return handoffPriceToBooking({
        state, flow, data, policy, bookingContext,
      });
    }
    if (isNegative(text, policy)) {
      delete state.priceInquiry;
      return 'تمام 🌸 أنا معك إذا احتجتِ أي خدمة أخرى.';
    }
  }

  const compoundReply = await handleCompoundPriceInput({
    text, flow, data, policy, priceService, now,
  });
  if (compoundReply) return compoundReply;

  switch (flow.state) {
    case 'awaiting_price_service': {
      const matches = matchingServices(text, data.services, policy);
      if (matches.length !== 1) {
        return matches.length > 1
          ? priceServiceChoice(matches, data.clinic, policy)
          : unknownPriceService(data.services, data.clinic, policy);
      }
      selectPriceService(flow, matches[0]);
      return resolveCashPrice({ flow, data, priceService, now, policy });
    }
    case 'awaiting_price_payment_method': {
      const method = paymentChoice(text, data.paymentMethods, policy);
      if (!method) return policy.paymentMethods(data.paymentMethods, true);
      flow.selected_payment_method = method.code;
      if (method.code === 'cash') {
        flow.state = 'awaiting_price_booking_confirmation';
        return cashBookingReply(flow);
      }
      const options = await pricedInsuranceOptions({
        flow, data, priceService,
      });
      flow.state = 'awaiting_price_insurance_company';
      return policy.insuranceCompanies(options.companies, true);
    }
    case 'awaiting_price_insurance_company': {
      const options = await pricedInsuranceOptions({ flow, data, priceService });
      const matches = matchingNamed(
        contextualSelectionText(text, policy), options.companies, policy
      );
      if (matches.length !== 1) {
        return unpricedCompanyReply(flow, options.companies);
      }
      flow.selected_insurance_company_id = matches[0].id;
      flow.selected_insurance_company_name = matches[0].name;
      flow.selected_insurance_class_id = null;
      flow.selected_insurance_class_name = null;
      flow.resolved_insurance_price = null;
      flow.state = 'awaiting_price_insurance_class';
      const companyOptions = await pricedInsuranceOptions({
        flow, data, priceService, insuranceCompanyId: matches[0].id,
      });
      return policy.insuranceClasses(companyOptions.classes, true);
    }
    case 'awaiting_price_insurance_class': {
      const options = await pricedInsuranceOptions({
        flow, data, priceService,
        insuranceCompanyId: flow.selected_insurance_company_id,
      });
      const matches = matchingNamed(
        contextualSelectionText(text, policy), options.classes, policy
      );
      if (matches.length !== 1) {
        const masterMatches = matchingNamed(
          contextualSelectionText(text, policy),
          data.insuranceClasses.filter((item) =>
            item.insuranceCompanyId === flow.selected_insurance_company_id
          ),
          policy
        );
        if (masterMatches.length === 1 && !masterMatches[0].isAccepted) {
          flow.state = 'awaiting_price_cash_confirmation';
          return rejectedInsuranceClassReply(flow);
        }
        return unpricedClassReply(flow, text, options.classes);
      }
      const selected = matches[0];
      flow.selected_insurance_class_id = selected.id;
      flow.selected_insurance_class_name = selected.name;
      return resolveInsurancePrice({ flow, data, priceService, now });
    }
    case 'awaiting_price_cash_confirmation':
      return 'تمام 🌸 يمكنني تحويل طلبك للموظف المختص.';
    case 'price_inquiry_ready':
      return continueReadyPriceInquiry({
        text, state, flow, data, policy, priceService, now, bookingContext,
      });
    case 'awaiting_price_booking_confirmation':
      return 'هل ترغبين في حجز موعد؟ 🌸';
    default:
      return priceServiceChoice(data.services, data.clinic, policy);
  }
}

function emptyPriceInquiryState() {
  return {
    intent: 'price_inquiry', state: 'awaiting_price_service',
    selected_service_id: null, selected_service_name: null,
    selected_payment_method: null, selected_insurance_company_id: null,
    selected_insurance_company_name: null, selected_insurance_class_id: null,
    selected_insurance_class_name: null, resolved_cash_price: null,
    resolved_insurance_price: null, currency: null,
  };
}

function validSelectedService(flow, services) {
  return typeof flow?.selected_service_id === 'string' &&
    flow.selected_service_id.trim().length > 0 &&
    services.some((service) => service.id === flow.selected_service_id);
}

function clearPriceSelection(flow) {
  Object.assign(flow, {
    state: 'awaiting_price_service',
    selected_service_id: null,
    selected_service_name: null,
    selected_payment_method: null,
    selected_insurance_company_id: null,
    selected_insurance_company_name: null,
    selected_insurance_class_id: null,
    selected_insurance_class_name: null,
    resolved_cash_price: null,
    resolved_insurance_price: null,
    currency: null,
  });
}

function isPriceInquiry(text, policy) {
  const normalized = policy.normalize(text);
  return /(سعر|اسعار|تكلفه|تكلفة|بكم|بكام)/.test(normalized);
}

function isExplicitGeneralPriceInquiry(text, policy) {
  const normalized = policy.normalize(text).trim().replace(/\s+/g, ' ');
  return /^(?:ما )?اسعار(?: الخدمات| خدماتكم|كم)$/.test(normalized);
}

function extractPriceServiceText(text, policy) {
  const normalized = policy.normalize(text)
    .replace(/(ما|كم|اريد|معرفه|معرفة|سعر|اسعار|الخدمات|الخدمه|الخدمة|خدمه|خدمة|تكلفه|تكلفة|بكم|بكام|كاش|نقدي)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 1 ? normalized : null;
}

function matchingServices(value, services, policy) {
  return matchingNamed(value, services, policy);
}

function matchingNamed(value, items, policy) {
  const needle = compactArabic(value, policy);
  if (!needle) return [];
  return items.filter((item) => [
    item.name,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ].some((candidate) => {
    const name = compactArabic(candidate, policy);
    return name && (
      name === needle || name.includes(needle) || needle.includes(name)
    );
  }));
}

function inquiryForDialogueDecision(decision) {
  switch (decision?.action) {
    case 'START_BOOKING':
      return { type: 'booking', serviceText: null };
    case 'REQUEST_CANCELLATION':
      return { type: 'booking_cancellation_request' };
    case 'REQUEST_RESCHEDULE':
      return { type: 'booking_modification_request' };
    case 'REQUEST_CHANGE_SERVICE':
      return { type: 'change_service_request' };
    case 'REQUEST_CHANGE_BRANCH':
      return { type: 'change_branch_request' };
    case 'REQUEST_CHANGE_PROVIDER':
      return { type: 'change_provider_request' };
    case 'CHECK_AVAILABILITY':
      return { type: 'availability_request' };
    case 'LOOKUP_APPOINTMENT':
      return { type: 'appointment_query' };
    case 'ANSWER':
      return decision.targetIntent === 'courtesy'
        ? { type: 'courtesy', kind: 'praise' }
        : null;
    default:
      return null;
  }
}

function compactArabic(value, policy) {
  return normalizeServiceAliases(policy.normalize(value))
    .replace(/ال/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function normalizeServiceAliases(value) {
  return String(value || '').replace(/بوتكس/g, 'بوتوكس');
}

function isGenericPriceSubject(value, policy) {
  return /^(خدمه|خدمة|خدمات)?$/.test(policy.normalize(value).trim());
}

async function handleCompoundPriceInput({
  text, flow, data, policy, priceService, now,
}) {
  const normalized = policy.normalize(text);
  const cashRequested = /(كاش|نقدي)/.test(normalized);
  const insuranceRequested = /(تامين|تأمين)/.test(normalized);
  if (cashRequested) {
    flow.selected_payment_method = 'cash';
    flow.selected_insurance_company_id = null;
    flow.selected_insurance_company_name = null;
    flow.selected_insurance_class_id = null;
    flow.selected_insurance_class_name = null;
    flow.resolved_insurance_price = null;
    flow.state = 'awaiting_price_booking_confirmation';
    return flow.resolved_cash_price
      ? cashBookingReply(flow)
      : resolveCashPrice({ flow, data, priceService, now, policy });
  }

  const options = await pricedInsuranceOptions({ flow, data, priceService });
  const companyMatches = matchingContained(text, options.companies, policy);
  const company = companyMatches.length === 1 ? companyMatches[0] : null;
  const companyId = company?.id || flow.selected_insurance_company_id;
  const classOptions = companyId
    ? (await pricedInsuranceOptions({
      flow, data, priceService, insuranceCompanyId: companyId,
    })).classes
    : options.classes;
  const classMatches = matchingContained(text, classOptions, policy);
  const insuranceContext = insuranceRequested || companyMatches.length > 0 ||
    classMatches.length > 0;
  if (!insuranceContext) return null;

  flow.selected_payment_method = 'insurance';
  if (company) {
    if (flow.selected_insurance_company_id !== company.id) {
      flow.selected_insurance_class_id = null;
      flow.selected_insurance_class_name = null;
      flow.resolved_insurance_price = null;
    }
    flow.selected_insurance_company_id = company.id;
    flow.selected_insurance_company_name = company.name;
  }

  const selectedClass = classMatches.length === 1 ? classMatches[0] : null;
  if (selectedClass && !flow.selected_insurance_company_id) {
    flow.selected_insurance_class_id = selectedClass.id;
    flow.selected_insurance_class_name = selectedClass.name;
    flow.state = 'awaiting_price_insurance_company';
    return policy.insuranceCompanies(options.companies, true);
  }
  if (!flow.selected_insurance_company_id) {
    flow.state = 'awaiting_price_insurance_company';
    return policy.insuranceCompanies(options.companies, true);
  }
  if (selectedClass) {
    flow.selected_insurance_class_id = selectedClass.id;
    flow.selected_insurance_class_name = selectedClass.name;
    return resolveInsurancePrice({ flow, data, priceService, now });
  }
  if (flow.selected_insurance_class_id && company &&
      classOptions.some((item) => item.id === flow.selected_insurance_class_id)) {
    return resolveInsurancePrice({ flow, data, priceService, now });
  }
  flow.selected_insurance_class_id = null;
  flow.selected_insurance_class_name = null;
  flow.state = 'awaiting_price_insurance_class';
  return policy.insuranceClasses(classOptions, true);
}

function matchingContained(value, items, policy) {
  const input = compactArabic(value, policy);
  return items.filter((item) => {
    const name = compactArabic(item.name, policy);
    return name && input.includes(name);
  });
}

function normalizePriceKeyboardInput(text, services, policy) {
  const raw = String(text || '');
  const latinCount = (raw.match(/[a-z]/gi) || []).length;
  const nonSpaceCount = (raw.match(/\S/g) || []).length;
  if (!nonSpaceCount || latinCount / nonSpaceCount < 0.75) return raw;
  const converted = [...raw.toLowerCase()].map((character) =>
    ARABIC_KEYBOARD[character] ?? character
  ).join('');
  if (!isPriceInquiry(converted, policy)) return raw;
  const subject = extractPriceServiceText(converted, policy);
  if (!subject || isGenericPriceSubject(subject, policy) ||
      matchingServices(subject, services, policy).length > 0) {
    return converted;
  }
  return raw;
}

const ARABIC_KEYBOARD = Object.freeze({
  q: 'ض', w: 'ص', e: 'ث', r: 'ق', t: 'ف', y: 'غ', u: 'ع', i: 'ه', o: 'خ', p: 'ح',
  '[': 'ج', ']': 'د', a: 'ش', s: 'س', d: 'ي', f: 'ب', g: 'ل', h: 'ا', j: 'ت',
  k: 'ن', l: 'م', ';': 'ك', "'": 'ط', z: 'ئ', x: 'ء', c: 'ؤ', v: 'ر', b: 'لا',
  n: 'ى', m: 'ة', ',': 'و', '.': 'ز', '/': 'ظ',
});

function selectPriceService(flow, service) {
  flow.selected_service_id = service.id;
  flow.selected_service_name = service.name;
}

async function resolveCashPrice({ flow, data, priceService, now, policy }) {
  const cash = data.paymentMethods.find((item) =>
    String(item.code || '').toLowerCase() === 'cash'
  );
  if (!cash || !priceService) return unavailableCashReply();
  try {
    const price = await priceService.resolvePrice({
      clinicId: data.clinic.id,
      serviceId: flow.selected_service_id,
      paymentMethodId: cash.id,
      bookingDate: now,
    });
    flow.resolved_cash_price = String(price.price);
    flow.currency = price.currency || 'SAR';
    flow.state = 'awaiting_price_payment_method';
    return `سعر ${flow.selected_service_name} كاش ${displayPrice(price.price)} ريال 🌸\nهل الدفع كاش أم تأمين؟`;
  } catch {
    flow.state = 'awaiting_price_service';
    return unavailableCashReply();
  }
}

async function resolveInsurancePrice({ flow, data, priceService, now }) {
  const insurance = data.paymentMethods.find((item) =>
    String(item.code || '').toLowerCase() === 'insurance'
  );
  if (!insurance || !priceService) return unavailableInsuranceReply();
  try {
    const price = await priceService.resolvePrice({
      clinicId: data.clinic.id,
      serviceId: flow.selected_service_id,
      paymentMethodId: insurance.id,
      insuranceCompanyId: flow.selected_insurance_company_id,
      insuranceClassId: flow.selected_insurance_class_id,
      bookingDate: now,
    });
    flow.selected_payment_method = 'insurance';
    flow.resolved_insurance_price = String(price.price);
    flow.currency = price.currency || flow.currency || 'SAR';
    flow.state = 'awaiting_price_booking_confirmation';
    return `سعر ${flow.selected_service_name} على ${flow.selected_insurance_company_name} فئة ${flow.selected_insurance_class_name} هو ${displayPrice(price.price)} ريال 🌸\nهل ترغبين في حجز موعد؟`;
  } catch {
    flow.state = 'awaiting_price_cash_confirmation';
    return unavailableInsuranceReply();
  }
}

async function pricedInsuranceOptions({
  flow, data, priceService, insuranceCompanyId = null,
}) {
  if (!validSelectedService(flow, data.services)) {
    return { companies: [], classes: [] };
  }
  const insurance = data.paymentMethods.find((item) =>
    String(item.code || '').toLowerCase() === 'insurance'
  );
  if (!insurance ||
      typeof priceService?.listApplicableInsuranceOptions !== 'function') {
    return { companies: [], classes: [] };
  }
  return priceService.listApplicableInsuranceOptions({
    clinicId: data.clinic.id,
    serviceId: flow.selected_service_id,
    paymentMethodId: insurance.id,
    insuranceCompanyId,
  });
}

async function continueReadyPriceInquiry({
  text, state, flow, data, policy, priceService, now, bookingContext,
}) {
  const normalized = policy.normalize(text);
  if (/حجز/.test(normalized)) {
    return handoffPriceToBooking({
      state, flow, data, policy, bookingContext,
    });
  }
  if (/(كاش|نقدي)/.test(normalized)) {
    flow.selected_payment_method = 'cash';
    flow.resolved_insurance_price = null;
    flow.state = 'awaiting_price_booking_confirmation';
    if (flow.resolved_cash_price) return cashBookingReply(flow);
    return resolveCashPrice({ flow, data, priceService, now, policy });
  }

  const scoped = await pricedInsuranceOptions({ flow, data, priceService });
  const selection = contextualSelectionText(text, policy);
  const companyMatches = matchingNamed(selection, scoped.companies, policy);
  if (companyMatches.length === 1) {
    const company = companyMatches[0];
    flow.selected_payment_method = 'insurance';
    flow.selected_insurance_company_id = company.id;
    flow.selected_insurance_company_name = company.name;
    flow.selected_insurance_class_id = null;
    flow.selected_insurance_class_name = null;
    flow.resolved_insurance_price = null;
    flow.state = 'awaiting_price_insurance_class';
    const options = await pricedInsuranceOptions({
      flow, data, priceService, insuranceCompanyId: company.id,
    });
    return policy.insuranceClasses(options.classes, true);
  }

  if (flow.selected_insurance_company_id) {
    const options = await pricedInsuranceOptions({
      flow, data, priceService,
      insuranceCompanyId: flow.selected_insurance_company_id,
    });
    const classMatches = matchingNamed(selection, options.classes, policy);
    if (classMatches.length === 1) {
      flow.selected_payment_method = 'insurance';
      flow.selected_insurance_class_id = classMatches[0].id;
      flow.selected_insurance_class_name = classMatches[0].name;
      return resolveInsurancePrice({ flow, data, priceService, now });
    }
    const masterClass = matchingNamed(selection, data.insuranceClasses, policy);
    if (masterClass.length) {
      if (masterClass.length === 1 && !masterClass[0].isAccepted) {
        flow.state = 'awaiting_price_cash_confirmation';
        return rejectedInsuranceClassReply(flow);
      }
      return unpricedClassReply(flow, text, options.classes);
    }
  }

  const masterCompany = matchingNamed(selection, data.insuranceCompanies, policy);
  if (masterCompany.length) return unpricedCompanyReply(flow, scoped.companies);

  const serviceMatches = matchingServices(selection, data.services, policy);
  if (serviceMatches.length === 1) {
    selectPriceService(flow, serviceMatches[0]);
    flow.selected_payment_method = null;
    flow.selected_insurance_company_id = null;
    flow.selected_insurance_company_name = null;
    flow.selected_insurance_class_id = null;
    flow.selected_insurance_class_name = null;
    flow.resolved_insurance_price = null;
    return resolveCashPrice({ flow, data, priceService, now, policy });
  }

  return 'يمكنكِ اختيار كاش، شركة تأمين، فئة أخرى، أو بدء الحجز 🌸';
}

function contextualSelectionText(text, policy) {
  return policy.normalize(text)
    .replace(/(ما|طيب|طب|ولو|و لو|فئه|فئة|سعرها|سعر|على|كم|بكم|بكام|هو|هي)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unpricedCompanyReply(flow, companies) {
  return `لا يوجد سعر مسجل لـ${flow.selected_service_name} على شركة التأمين المطلوبة حاليًا 🌸\nالشركات المتاحة:\n${formatNames(companies)}`;
}

function unpricedClassReply(flow, text, classes) {
  const requested = String(text || '').trim();
  return `لا يوجد سعر مسجل لـ${flow.selected_service_name} على ${flow.selected_insurance_company_name || 'شركة التأمين'} فئة ${requested} حاليًا 🌸\nالفئات المتاحة:\n${formatNames(classes)}`;
}

function rejectedInsuranceClassReply(flow) {
  return `نعتذر، هذه الفئة غير مشمولة لدينا حاليًا 🌸\nيمكننا إكمال الطلب كاش بسعر ${displayPrice(flow.resolved_cash_price)} ${flow.currency || 'SAR'}.\nهل ترغبين في المتابعة كاش؟`;
}

function paymentChoice(text, methods, policy) {
  const normalized = policy.normalize(text);
  const code = /(كاش|نقدي)/.test(normalized)
    ? 'cash'
    : /(تامين|تأمين)/.test(normalized) ? 'insurance' : null;
  return code ? methods.find((item) => String(item.code).toLowerCase() === code) || null : null;
}

function classesForCompany(data, companyId) {
  return data.insuranceClasses.filter((item) =>
    item.insuranceCompanyId === companyId
  );
}

function isAffirmative(text, policy) {
  return /^(نعم|اي|ايوه|ايوا|تمام|موافق|اكيد|احجز|احجزي|ابغى احجز|اريد الحجز)$/.test(
    policy.normalize(text).trim()
  );
}

function isNegative(text, policy) {
  return /^(لا|مش الان|مو الان|لاحقا|لا شكرا)$/.test(
    policy.normalize(text).trim()
  );
}

function isBookingConfirmation(text, policy) {
  return isAffirmative(text, policy) || /^(حجز|ابدأ الحجز)$/.test(
    policy.normalize(text).trim()
  );
}

function handoffPriceToBooking({ state, flow, data, policy, bookingContext }) {
  const service = data.services.find((item) =>
    item.id === flow.selected_service_id
  );
  const paymentMethod = data.paymentMethods.find((item) =>
    String(item.code || '').toLowerCase() === flow.selected_payment_method
  );
  if (!service || !paymentMethod) {
    return priceServiceChoice(data.services, data.clinic, policy);
  }
  const insurance = flow.selected_payment_method === 'insurance';
  const booking = emptyBookingState();
  booking.paymentMethodId = paymentMethod.id;
  booking.insuranceCompanyId = insurance
    ? flow.selected_insurance_company_id
    : null;
  booking.insuranceClassId = insurance
    ? flow.selected_insurance_class_id
    : null;
  booking.serviceName = flow.selected_service_name;
  booking.paymentMethodCode = flow.selected_payment_method;
  booking.quotedPrice = insurance
    ? flow.resolved_insurance_price
    : flow.resolved_cash_price;
  booking.currency = flow.currency;
  booking.clinicId = bookingContext?.clinicId || data.clinic.id || null;
  booking.patientId = bookingContext?.patientId || null;
  state.booking = booking;
  delete state.priceInquiry;
  return advanceFromServiceSelection(booking, service, data, policy);
}

function priceServiceChoice(services, clinic, policy) {
  return `${policy.services(services, clinic)}\nاختاري خدمة واحدة لمعرفة سعرها.`;
}

function unknownPriceService(services, clinic, policy) {
  return `لم أتعرف على الخدمة.\n${priceServiceChoice(services, clinic, policy)}`;
}

function formatNames(items) {
  return items.length ? items.map((item) => `▪️ ${item.name}`).join('\n') : 'لا توجد خيارات متاحة حاليًا.';
}

function displayPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value || '');
}

function cashBookingReply(flow) {
  return `تمام 🌸\nسعر ${flow.selected_service_name} كاش ${displayPrice(flow.resolved_cash_price)} ريال.\nهل ترغبين في حجز موعد؟`;
}

function unavailableCashReply() {
  return 'سعر هذه الخدمة غير متاح حاليًا 🌸\nيمكنني تحويل طلبك للموظف المختص.';
}

function unavailableInsuranceReply() {
  return 'لا يوجد سعر تأمين مسجل لهذه الخدمة على الشركة والفئة المحددتين حاليًا 🌸\nيمكننا إكمال الطلب كاش أو تحويلك للموظف المختص.';
}

const BOOKING_FIELDS = Object.freeze([
  'step',
  'specialtyId',
  'serviceId',
  'city',
  'branchId',
  'doctorId',
  'roomId',
  'date',
  'datePeriod',
  'timePeriod',
  'preferredStart',
  'paymentMethodId',
  'insuranceCompanyId',
  'insuranceClassId',
  'serviceName',
  'paymentMethodCode',
  'quotedPrice',
  'currency',
  'clinicId',
  'patientId',
]);

const BOOKING_STEPS = new Set([
  'specialty',
  'service',
  'city',
  'branch',
  'doctor',
  'date_period',
  'date',
  'time_period',
  'time',
  'availability',
  'patient',
  'payment_method',
  'insurance_company',
  'insurance_class',
  'confirmation',
  'ready',
]);

function normalizeBookingState(state) {
  const bookingProperty = Object.getOwnPropertyDescriptor(state, 'booking');
  if (!bookingProperty || bookingProperty.get || bookingProperty.set) return null;
  const booking = bookingProperty.value;
  if (!isPlainObject(booking)) return null;

  const ownKeys = Reflect.ownKeys(booking);
  if (ownKeys.length < 6 || ownKeys.length > BOOKING_FIELDS.length) return null;
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !BOOKING_FIELDS.includes(key)) return null;
  }

  const values = Object.create(null);
  for (const field of BOOKING_FIELDS) {
    const property = Object.getOwnPropertyDescriptor(booking, field);
    if (!property) {
      if ([
        'specialtyId', 'city', 'roomId', 'date', 'datePeriod', 'timePeriod', 'insuranceCompanyId', 'insuranceClassId', 'serviceName',
        'paymentMethodCode', 'quotedPrice', 'currency', 'clinicId', 'patientId',
      ].includes(field)) {
        values[field] = null;
        continue;
      }
      return null;
    }
    if (property.get || property.set) return null;
    values[field] = property.value;
  }

  if (typeof values.step !== 'string' || !BOOKING_STEPS.has(values.step)) {
    return null;
  }
  for (const field of [
    'serviceId',
    'specialtyId',
    'city',
    'branchId',
    'doctorId',
    'roomId',
    'date',
    'datePeriod',
    'timePeriod',
    'preferredStart',
    'paymentMethodId',
    'insuranceCompanyId',
    'insuranceClassId',
    'serviceName',
    'paymentMethodCode',
    'quotedPrice',
    'currency',
    'clinicId',
    'patientId',
  ]) {
    if (!isNullableNonBlankString(values[field])) return null;
  }
  if (!bookingFieldsMatchStep(values)) return null;

  const normalizedBooking = {
    step: values.step,
    serviceId: values.serviceId,
    branchId: values.branchId,
    doctorId: values.doctorId,
    preferredStart: values.preferredStart,
    paymentMethodId: values.paymentMethodId,
  };
  if (Object.hasOwn(booking, 'roomId')) {
    normalizedBooking.roomId = values.roomId;
  }
  if (Object.hasOwn(booking, 'specialtyId')) {
    normalizedBooking.specialtyId = values.specialtyId;
  }
  if (Object.hasOwn(booking, 'city')) {
    normalizedBooking.city = values.city;
  }
  if (Object.hasOwn(booking, 'date')) {
    normalizedBooking.date = values.date;
  }
  if (Object.hasOwn(booking, 'datePeriod')) {
    normalizedBooking.datePeriod = values.datePeriod;
  }
  if (Object.hasOwn(booking, 'timePeriod')) {
    normalizedBooking.timePeriod = values.timePeriod;
  }
  if (
    Object.hasOwn(booking, 'insuranceCompanyId') ||
    Object.hasOwn(booking, 'insuranceClassId')
  ) {
    normalizedBooking.insuranceCompanyId = values.insuranceCompanyId;
    normalizedBooking.insuranceClassId = values.insuranceClassId;
  }
  for (const field of [
    'serviceName', 'paymentMethodCode', 'quotedPrice', 'currency',
    'clinicId', 'patientId',
  ]) {
    if (Object.hasOwn(booking, field)) normalizedBooking[field] = values[field];
  }
  return normalizedBooking;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNullableNonBlankString(value) {
  return value === null ||
    (typeof value === 'string' && value.trim().length > 0);
}

function bookingFieldsMatchStep(booking) {
  const hasService = booking.serviceId !== null;
  const hasBranch = booking.branchId !== null;
  const hasDate = booking.date !== null;
  const hasAvailability = booking.preferredStart !== null;
  const hasPaymentMethod = booking.paymentMethodId !== null;

  switch (booking.step) {
    case 'specialty':
    case 'service':
      return true;
    case 'city':
      return hasService;
    case 'branch':
      return hasService;
    case 'date_period':
    case 'date':
      return hasService && hasBranch;
    case 'time_period':
    case 'time':
      return hasService && hasBranch && hasDate;
    case 'doctor':
    case 'availability':
      return hasService && hasBranch;
    case 'patient':
    case 'payment_method':
      return hasService && hasBranch && hasAvailability;
    case 'insurance_company':
      return hasService && hasBranch && hasAvailability && hasPaymentMethod;
    case 'insurance_class':
      return hasService && hasBranch && hasAvailability && hasPaymentMethod &&
        booking.insuranceCompanyId !== null;
    case 'confirmation':
    case 'ready':
      return hasService && hasBranch && hasAvailability && hasPaymentMethod;
    default:
      return false;
  }
}

function applySocialState(state, inquiry) {
  if (['greeting', 'combined_greeting', 'identity'].includes(inquiry.type) && !state.customer.name) state.step = 'customer_name';
  state.context = contextFor(inquiry);
}

function contextFor(inquiry) {
  if (['unknown', 'greeting', 'combined_greeting', 'booking'].includes(inquiry.type)) return null;
  return { inquiry: inquiry.type, ...(inquiry.city ? { city: inquiry.city } : {}), ...(inquiry.day !== undefined ? { day: inquiry.day } : {}) };
}

function findBranch(value, data, policy) {
  const needle = policy.normalize(value).replace(/ال/g, '').replace(/\s/g, '');
  const matches = data.branches.filter(branch => {
    const rawName = policy.normalize(branch.name).replace(/ال/g, '').replace(/\s/g, '');
    const cleanName = policy.normalize(policy.cleanBranchName(branch.name)).replace(/ال/g, '').replace(/\s/g, '');
    const city = policy.normalize(branch.city).replace(/ال/g, '').replace(/\s/g, '');
    return rawName === needle || cleanName === needle ||
      (needle.includes(cleanName) && (!city || needle.includes(city)));
  });
  return matches.length === 1 ? matches[0] : null;
}

function findExactService(value, services, policy) {
  const cleanNeedle = policy.normalize(value).replace(/ال/g, '').replace(/\s/g, '');
  return services.find(service => {
    const cleanName = policy.normalize(service.name).replace(/ال/g, '').replace(/\s/g, '');
    return cleanName === cleanNeedle || cleanName.includes(cleanNeedle) || cleanNeedle.includes(cleanName);
  }) || null;
}

function findInsuranceClass(value, classes, policy) {
  const needle = policy.normalize(value).replace(/^(class|فئه)\s*/, '');
  return classes.find(item => {
    const name = policy.normalize(item.name);
    return name === needle || name.replace(/^(class|فئه)\s*/, '') === needle;
  }) || null;
}

function workingDayReply(inquiry, data, policy) {
  const dayName = displayDay(inquiry.day);
  const responseLines = [`مواعيد العمل يوم ${dayName}:`];
  
  if (inquiry.branchText) {
    const cityText = policy.normalize(inquiry.branchText);
    const cities = ['جده', 'جدة', 'الرياض', 'الدمام', 'الاحساء', 'مكة', 'مكه', 'تبوك'];
    const isCity = cities.some(c => cityText.includes(c));
    
    if (isCity) {
      const branchesInCity = data.branches.filter(
        b => policy.normalize(b.city) === cityText
      );
      if (branchesInCity.length === 0) return policy.noActiveBranches(cityText);
      for (const branch of branchesInCity) {
        const hours = data.workingHours.find(h => h.branchId === branch.id && h.dayOfWeek === inquiry.day);
        if (hours) {
          const branchName = policy.cleanBranchName(branch.name);
          if (hours.isClosed) responseLines.push(`${branchName}: مغلق`);
          else responseLines.push(`${branchName}: من ${time(hours.opensAt)} إلى ${time(hours.closesAt)}`);
        }
      }
      responseLines.push('', '');
      return responseLines.join('\n');
    }
    
    const branch = findBranch(inquiry.branchText, data, policy);
    if (!branch) return `لا يوجد فرع بهذا الاسم لدينا.`;
    const hours = data.workingHours.find(h => h.branchId === branch.id && h.dayOfWeek === inquiry.day);
    return policy.workingDay({ branch, hours, day: dayName });
  }

  for (const branch of data.branches) {
    const hours = data.workingHours.find(h => h.branchId === branch.id && h.dayOfWeek === inquiry.day);
    if (hours) {
      const branchName = policy.cleanBranchName(branch.name);
      if (hours.isClosed) responseLines.push(`${branchName}: مغلق`);
      else responseLines.push(`${branchName}: من ${time(hours.opensAt)} إلى ${time(hours.closesAt)}`);
    }
  }
  responseLines.push('', '');
  return responseLines.join('\n');
}

function workingBranchReply(inquiry, data, policy) {
  const branch = findBranch(inquiry.branchText, data, policy);
  return policy.branchWorkingHours(branch, data);
}

function displayDay(day) { return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][day]; }
function time(value) { return value ? String(value).slice(0, 5) : 'غير محدد'; }

ShadenEngine.MAX_CANCELLATION_VERIFICATION_ATTEMPTS =
  MAX_CANCELLATION_VERIFICATION_ATTEMPTS;
ShadenEngine.createBookingState = emptyBookingState;
ShadenEngine.createCancellationState = createCancellationState;
ShadenEngine.createRescheduleState = createRescheduleState;
ShadenEngine.createChangeServiceState = createChangeServiceState;
ShadenEngine.createChangeBranchState = createChangeBranchState;
ShadenEngine.clearCancellationState = clearCancellationState;
ShadenEngine.replaceCancellationState = replaceCancellationState;
ShadenEngine.recordCancellationVerificationFailure =
  recordCancellationVerificationFailure;
ShadenEngine.matchingServices = matchingServices;
ShadenEngine.normalizeEngineReply = normalizeEngineReply;
ShadenEngine.FLOW_LIFECYCLE_STEPS = Object.freeze({
  booking: Object.freeze([...BOOKING_STEPS]),
  cancellation: Object.freeze([...CANCELLATION_STEPS]),
  reschedule: Object.freeze([...RESCHEDULE_STEPS]),
  changeService: Object.freeze([...CHANGE_SERVICE_STEPS]),
  changeBranch: Object.freeze([...CHANGE_BRANCH_STEPS]),
});

module.exports = ShadenEngine;
