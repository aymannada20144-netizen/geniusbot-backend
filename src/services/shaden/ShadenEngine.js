'use strict';

const ShadenPolicy = require('./ShadenPolicy');
const {
  parsePreferredStart: parseBookingPreferredStart,
} = require('./BookingDateTimeParser');

class ShadenEngine {
  constructor({
    policy = new ShadenPolicy(),
    bookingEngine = null,
    priceService = null,
    clock = null,
  } = {}) {
    this.policy = policy;
    this.bookingEngine = bookingEngine;
    this.priceService = priceService;
    this.clock = clock && typeof clock.now === 'function'
      ? clock
      : { now: () => new Date() };
  }

  handle({
    message,
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
    let inquiry = this.policy.recognize(text);

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
    };

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
      }).then((reply) => ({ reply, nextState }));
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
          return {
            reply: this.policy.bookingNameCaptured(name, safeData.services, safeData.clinic),
            nextState,
          };
        }
        return { reply: this.policy.nameCaptured(name), nextState };
      }
    }

    if (inquiry.type === 'booking' && !nextState.booking) {
      const requestedService = inquiry.serviceText
        ? findNamedSelection(inquiry.serviceText, safeData.services, this.policy)
        : null;
      if (inquiry.serviceText && !requestedService) {
        return { reply: this.policy.serviceExists(null), nextState };
      }
      nextState.booking = emptyBookingState();
      nextState.context = null;
      if (!customerName) {
        nextState.step = 'customer_name';
        return {
          reply: this.policy.bookingCustomerName(),
          nextState,
        };
      }
      if (requestedService) {
        return {
          reply: advanceFromServiceSelection(nextState.booking, requestedService, safeData, this.policy),
          nextState,
        };
      }
      return {
        reply: this.policy.bookingChooseService(safeData.services, safeData.clinic),
        nextState,
      };
    }

    if (nextState.booking) {
      const bookingReply = handleBookingStep({
        text,
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
          return bookingReply.then((reply) => ({ reply, nextState }));
        }
        return { reply: bookingReply, nextState };
      }
    }

    let reply;
    try {
      reply = this.replyFor(inquiry, safeData, customerName);
    } catch (error) {
      console.error('❌ Error generating reply:', error);
      reply = this.policy.unknown();
    }

    applySocialState(nextState, inquiry);
    return { reply, nextState };
  }

  replyFor(inquiry, data, customerName) {
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
      
      case 'branches':
        if (inquiry.city) {
          const branchesInCity = data.branches.filter(
            b => this.policy.normalize(b.city) === this.policy.normalize(inquiry.city)
          );
          if (branchesInCity.length > 0) return `نعم، لدينا ${branchesInCity.length} فروع في ${this.policy.display(inquiry.city)}:\n${this.policy.branches(branchesInCity)}`;
          return this.policy.noActiveBranches(inquiry.city);
        }
        return this.policy.branches(data.branches);
        
      case 'specialties': return this.policy.specialties(data.specialties, data.clinic);
      case 'services': return this.policy.services(data.services, data.clinic);
      case 'services_under_specialty':
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

function advanceFromServiceSelection(booking, service, data, policy) {
  booking.serviceId = service.id;
  const cities = availableCities(data.branches, policy);
  if (cities.length > 1) {
    booking.step = 'city';
    return policy.bookingChooseCity(cities);
  }
  booking.city = cities[0] || null;
  booking.step = 'branch';
  return policy.bookingChooseBranch(branchesForCity(data.branches, booking.city, policy));
}

function emptyBookingState() {
  return {
    step: 'service',
    serviceId: null,
    city: null,
    branchId: null,
    doctorId: null,
    preferredStart: null,
    paymentMethodId: null,
    insuranceCompanyId: null,
    insuranceClassId: null,
  };
}

function handleBookingStep({
  text,
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

  switch (booking.step) {
    case 'service': {
      const service = findNamedSelection(text, data.services, policy);
      if (service) {
        booking.serviceId = service.id;
        const cities = availableCities(data.branches, policy);
        const mentionedCity = cities.find(city =>
          policy.normalize(text).includes(policy.normalize(city))
        );
        if (mentionedCity) {
          booking.city = mentionedCity;
          booking.step = 'branch';
          return policy.bookingChooseBranch(branchesForCity(data.branches, mentionedCity, policy));
        }
        if (cities.length > 1) {
          booking.step = 'city';
          return policy.bookingChooseCity(cities);
        }
        booking.city = cities[0] || null;
        booking.step = 'branch';
        return policy.bookingChooseBranch(branchesForCity(data.branches, booking.city, policy));
      }
      return bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingChooseService(data.services, data.clinic),
      });
    }

    case 'city': {
      const directBranch = findBranchSelection(text, data.branches, policy);
      if (directBranch) {
        booking.city = directBranch.city || null;
        booking.branchId = directBranch.id;
        booking.step = 'availability';
        return policy.bookingAskAvailability();
      }
      const selectedCity = availableCities(data.branches, policy).find(
        city => policy.normalize(city) === policy.normalize(text)
      );
      if (selectedCity) {
        booking.city = selectedCity;
        booking.branchId = null;
        booking.doctorId = null;
        booking.preferredStart = null;
        booking.step = 'branch';
        return policy.bookingChooseBranch(branchesForCity(data.branches, selectedCity, policy));
      }
      return policy.bookingChooseCity(availableCities(data.branches, policy));
    }

    case 'branch': {
      const candidates = branchesForCity(data.branches, booking.city, policy);
      const branch = findBranchSelection(text, candidates, policy);
      if (branch) {
        booking.city = branch.city || booking.city;
        booking.branchId = branch.id;
        booking.step = 'availability';
        return policy.bookingAskAvailability();
      }
      return bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingChooseBranch(candidates),
      });
    }

    case 'doctor':
      return policy.bookingAskAvailability();

    case 'availability': {
      const branch = findById(data.branches, booking.branchId);
      const availability = parseBookingPreferredStart(
        text,
        booking.preferredStart,
        policy,
        { timeZone: branch?.timezone || 'Asia/Riyadh', now }
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
      return policy.bookingChoosePaymentMethod(data.paymentMethods);

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
          return policy.bookingChooseInsuranceCompany(data.insuranceCompanies);
        }
        booking.step = 'confirmation';
        return bookingSummary(policy, data, booking);
      }
      return bookingKnowledgeOrReminder({
        inquiry,
        data,
        state,
        policy,
        replyFor,
        customerName,
        reminder: policy.bookingChoosePaymentMethod(data.paymentMethods),
      });
    }

    case 'insurance_company': {
      const company = findNamedSelection(
        text,
        data.insuranceCompanies,
        policy
      );
      if (!company) {
        return policy.bookingChooseInsuranceCompany(data.insuranceCompanies);
      }
      booking.insuranceCompanyId = company.id;
      booking.insuranceClassId = null;
      booking.step = 'insurance_class';
      return policy.bookingChooseInsuranceClass(
        data.insuranceClasses.filter((item) =>
          item.insuranceCompanyId === company.id && item.isAccepted)
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
        return policy.bookingChooseInsuranceClass(
          data.insuranceClasses.filter((item) =>
            item.insuranceCompanyId === booking.insuranceCompanyId &&
            item.isAccepted)
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
    return policy.bookingChooseInsuranceCompany(data.insuranceCompanies);
  }
  if (insurance && !insuranceClass) {
    booking.step = 'insurance_class';
    booking.insuranceClassId = null;
    return policy.bookingChooseInsuranceClass(
      data.insuranceClasses.filter((item) =>
        item.insuranceCompanyId === insuranceCompany.id && item.isAccepted)
    );
  }
  return policy.bookingConfirmationSummary({
    service: findById(data.services, booking.serviceId),
    branch: findById(data.branches, booking.branchId),
    preferredStart: booking.preferredStart,
    paymentMethod,
    insuranceCompany: insurance ? insuranceCompany : null,
    insuranceClass: insurance ? insuranceClass : null,
  });
}

async function validateEarlyAvailability({
  booking,
  data,
  policy,
  bookingEngine,
  bookingContext,
  parsedAvailability,
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
      doctor: booking.doctorId ? { id: booking.doctorId } : null,
      availability: { preferredStart: booking.preferredStart },
    });
  } catch (error) {
    console.error('BOOKING_AVAILABILITY_CHECK_FAILED', { code: error?.code || null });
    return policy.bookingAvailabilityCheckFailed();
  }
  if (result.status === 'available') {
    if (booking.paymentMethodId !== null) {
      booking.step = 'confirmation';
      return bookingSummary(policy, data, booking);
    }
    booking.step = 'payment_method';
    return policy.bookingChoosePaymentMethod(data.paymentMethods);
  }
  const reason = result.metadata?.reasonCode || result.reason || 'technical_failure';
  booking.step = 'availability';
  booking.preferredStart = preferredStartAfterRejection(reason, parsedAvailability);
  return policy.bookingAvailabilityRejected({
    reason,
    branch: findById(data.branches, booking.branchId),
  });
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
    return policy.bookingCreated({
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
    });
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

function findBranchSelection(text, branches, policy) {
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
  return normalized;
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
  return items.filter((item) => {
    const name = compactArabic(item.name, policy);
    return name === needle || name.includes(needle) || needle.includes(name);
  });
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
  'serviceId',
  'city',
  'branchId',
  'doctorId',
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
  'service',
  'city',
  'branch',
  'doctor',
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
        'city', 'insuranceCompanyId', 'insuranceClassId', 'serviceName',
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
    'city',
    'branchId',
    'doctorId',
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
  if (Object.hasOwn(booking, 'city')) {
    normalizedBooking.city = values.city;
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
  const hasAvailability = booking.preferredStart !== null;
  const hasPaymentMethod = booking.paymentMethodId !== null;

  switch (booking.step) {
    case 'service':
      return true;
    case 'city':
      return hasService;
    case 'branch':
      return hasService;
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

module.exports = ShadenEngine;