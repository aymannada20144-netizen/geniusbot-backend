'use strict';

const ShadenPolicy = require('./ShadenPolicy');
const {
  parsePreferredStart: parseBookingPreferredStart,
  DEFAULT_TIME_ZONE,
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
    const interactiveReplyId = message && typeof message === 'object'
      ? message.rawPayload?.value
      : null;
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
      }).then((result) => normalizeEngineReply(result, nextState));
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
              bookableServices(safeData.services),
              safeData.clinic
            ),
            nextState.booking,
            safeData,
            this.policy
          );
          return { ...choice, nextState };
        }
        return { reply: this.policy.nameCaptured(name), nextState };
      }
    }

    if (inquiry.type === 'booking' && !nextState.booking) {
      const requestedService = inquiry.serviceText
        ? findNamedSelection(inquiry.serviceText, bookableServices(safeData.services), this.policy)
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
        return normalizeEngineReply(
          advanceFromServiceSelection(
            nextState.booking,
            requestedService,
            safeData,
            this.policy
          ),
          nextState
        );
      }
      const choice = bookingServiceChoiceReply(
        this.policy.bookingChooseService(
          bookableServices(safeData.services),
          safeData.clinic
        ),
        nextState.booking,
        safeData,
        this.policy
      );
      return { ...choice, nextState };
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
            normalizeEngineReply(result, nextState)
          );
        }
        return normalizeEngineReply(bookingReply, nextState);
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
    return cityListReply(policy.bookingChooseCity(cities), cities, policy);
  }
  booking.city = cities[0] || null;
  booking.step = 'branch';
  const branches = branchesForCity(data.branches, booking.city, policy);
  return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
}

function emptyBookingState() {
  return {
    step: 'service',
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
      booking.specialtyId = selection.specialtyId;
      booking.step = 'service';
      const services = servicesForSpecialty(
        bookableServices(data.services),
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
      const availableServices = booking.specialtyId == null
        ? bookableServices(data.services)
        : servicesForSpecialty(
          bookableServices(data.services),
          booking.specialtyId
        );
      if (booking.specialtyId == null && availableServices.length > 10) {
        booking.step = 'specialty';
        return specialtyListReply(
          policy.specialties(bookingSpecialties(data), data.clinic),
          data,
          policy
        );
      }
      const service = findServiceSelection(
        interactiveReplyId,
        text,
        availableServices,
        policy
      );
      if (service) {
        booking.serviceId = service.id;
        const cities = availableCities(data.branches, policy);
        const mentionedCity = cities.find(city =>
          policy.normalize(text).includes(policy.normalize(city))
        );
        if (mentionedCity) {
          booking.city = mentionedCity;
          booking.step = 'branch';
          const branches = branchesForCity(data.branches, mentionedCity, policy);
          return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
        }
        if (cities.length > 1) {
          booking.step = 'city';
          return cityListReply(policy.bookingChooseCity(cities), cities, policy);
        }
        booking.city = cities[0] || null;
        booking.step = 'branch';
        const branches = branchesForCity(data.branches, booking.city, policy);
        return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
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
      const cities = availableCities(data.branches, policy);
      const hasCityReplyId = typeof interactiveReplyId === 'string' &&
        interactiveReplyId.startsWith('city:');
      const directBranch = hasCityReplyId
        ? null
        : findBranchSelection(null, text, data.branches, policy);
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
        booking.city = selectedCity;
        booking.branchId = null;
        booking.doctorId = null;
        booking.preferredStart = null;
        booking.step = 'branch';
        const branches = branchesForCity(data.branches, selectedCity, policy);
        return branchListReply(policy.bookingChooseBranch(branches), branches, policy);
      }
      return cityListReply(policy.bookingChooseCity(cities), cities, policy);
    }

    case 'branch': {
      const candidates = branchesForCity(data.branches, booking.city, policy);
      const branch = findBranchSelection(
        interactiveReplyId,
        text,
        candidates,
        policy
      );
      if (branch) {
        booking.city = branch.city || booking.city;
        booking.branchId = branch.id;
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

function normalizeEngineReply(result, nextState) {
  if (
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    typeof result.reply === 'string'
  ) {
    return {
      reply: result.reply,
      nextState,
      ...(result.interaction ? { interaction: result.interaction } : {}),
    };
  }
  return { reply: result, nextState };
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
  const services = bookableServices(data.services);
  booking.specialtyId = null;
  if (services.length <= 10) {
    booking.step = 'service';
    return serviceListReply(reply, services, policy);
  }
  booking.step = 'specialty';
  return specialtyListReply(
    policy.specialties(bookingSpecialties(data), data.clinic),
    data,
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
  const services = bookableServices(data.services);
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

module.exports = ShadenEngine;
