const BookingValidator = require('./BookingValidator');
const BookingPatientResolver = require(
  './BookingPatientResolver'
);
const BookingAppointmentFactory = require(
  './BookingAppointmentFactory'
);
const BookingAvailabilityService = require(
  './BookingAvailabilityService'
);
const BookingAssignmentResolver = require(
  './BookingAssignmentResolver'
);
const PriceService = require('../PriceService');
const NotificationService = require('../NotificationService');

class BookingOrchestrator {
  constructor(
    repositories,
    availabilityService,
    communicationService = null,
    notificationService = null
  ) {
    if (!repositories) {
      throw new Error(
        'BookingOrchestrator requires repositories'
      );
    }

    if (!availabilityService) {
      throw new Error(
        'BookingOrchestrator requires availabilityService'
      );
    }

    this.repositories = repositories;

    this.validator = new BookingValidator();

    this.patientResolver =
      new BookingPatientResolver(
        repositories
      );

    this.bookingAvailabilityService =
      new BookingAvailabilityService(
        availabilityService
      );

    this.assignmentResolver =
      new BookingAssignmentResolver(
        repositories,
        this.bookingAvailabilityService
      );

    this.appointmentFactory =
      new BookingAppointmentFactory(
        repositories,
        this.validator
      );

    this.priceService = repositories.prices
      ? new PriceService(repositories.prices)
      : null;
    this.notificationService = notificationService || (repositories.notifications
      ? new NotificationService(
          repositories.notifications,
          communicationService
        )
      : null);
  }

  async bookAppointment(data = {}) {
    this.validator.validateBookingInput(data);

    const clinic =
      await this.repositories.clinics.findById(
        data.clinic_id
      );

    if (!clinic || clinic.is_active !== true) {
      return {
        success: false,
        reason: 'clinic_not_found',
        message:
          'Clinic not found or inactive',
      };
    }

    if (this.repositories.branches) {
      const branch = await this.repositories.branches.findActiveById(
        data.clinic_id,
        data.branch_id
      );

      if (!branch) {
        return {
          success: false,
          reason: 'branch_not_found',
          message: 'Branch not found or inactive',
        };
      }
    }

    const service =
      await this.repositories.services
        .findActiveById(
          data.clinic_id,
          data.service_id
        );

    if (
      !service ||
      service.is_booking_enabled !== true
    ) {
      return {
        success: false,
        reason: 'service_not_available',
        message:
          'Service not found or booking is disabled',
      };
    }

    const patient =
      await this.patientResolver.resolve(data);

    if (!patient) {
      return {
        success: false,
        reason: 'patient_not_found',
        message: 'Patient not found',
      };
    }

    const {
      appointmentStart,
      appointmentEnd,
    } =
      this.appointmentFactory
        .buildAppointmentTimes(
          data.preferred_start,
          service.duration_minutes
        );

    const resolution =
      await this.assignmentResolver.resolve({
        clinic_id: data.clinic_id,
        branch_id: data.branch_id,
        service_id: service.id,

        doctor_id: data.doctor_id || null,
        room_id: data.room_id || null,

        appointment_start: appointmentStart,
        appointment_end: appointmentEnd,
        patient_id: data.patient_id || null,
        excludeAppointmentId: data.excludeAppointmentId || null,
      });

    if (!resolution.resolved) {
      if (resolution.availability) {
        return {
          success: false,
          reason: resolution.availability.reason || 'slot_not_available',
          availability:
            resolution.availability,
        };
      }

      return {
        success: false,
        reason: resolution.reason,
        message: resolution.message,
      };
    }

    let assignment =
      resolution.assignment;

    const revalidation = await this.assignmentResolver.resolve({
      clinic_id: data.clinic_id,
      branch_id: data.branch_id,
      service_id: service.id,
      doctor_id: assignment.doctor_id || null,
      room_id: assignment.room_id || null,
      appointment_start: appointmentStart,
      appointment_end: appointmentEnd,
      patient_id: data.patient_id || null,
      excludeAppointmentId: data.excludeAppointmentId || null,
    });

    if (!revalidation.resolved || revalidation.assignment.id !== assignment.id) {
      return {
        success: false,
        reason: revalidation.availability?.reason ||
          revalidation.reason || 'service_assignment_not_found',
        message: revalidation.message || 'The selected assignment is no longer available.',
        availability: revalidation.availability,
      };
    }

    assignment = revalidation.assignment;

    if (!this.priceService) {
      throw new Error(
        'BookingOrchestrator requires prices repository before creation'
      );
    }

    const resolvedPrice = await this.priceService.resolvePrice({
      clinicId: data.clinic_id,
      serviceId: service.id,
      paymentMethodId: data.payment_method_id,
      insuranceCompanyId: data.insurance_company_id || null,
      insuranceClassId: data.insurance_class_id || null,
      bookingDate: appointmentStart,
    });

    const appointmentData = {
      ...data,
      quoted_price: resolvedPrice.price,
      currency: resolvedPrice.currency,
    };

    const appointment =
      await this.appointmentFactory.create({
        data: appointmentData,
        patient,
        service,
        assignment,
        appointmentStart,
        appointmentEnd,
      });

    let notification = { scheduled: false, reason: 'not_configured' };
    if (this.notificationService) {
      try {
        await this.notificationService.scheduleAppointmentLifecycle(
          appointment
        );
        notification = { scheduled: true };
      } catch (error) {
  notification = {
    scheduled: false,
    reason: 'scheduling_failed',
  };

  console.error('Appointment notification scheduling failed.');
  console.error(error);
}
    }

    return {
      success: true,
      stage: 'appointment_created',
      clinic,
      service,
      patient,
      availability:
        resolution.availability,
      assignment,
      price: resolvedPrice,
      appointment,
      notification,
    };
  }

  async checkAvailability(data = {}) {
    const clinic = await this.repositories.clinics.findById(data.clinic_id);
    if (!clinic || clinic.is_active !== true) {
      return { success: false, reason: 'clinic_not_found' };
    }
    const service = await this.repositories.services.findActiveById(
      data.clinic_id,
      data.service_id
    );
    if (!service || service.is_booking_enabled !== true) {
      return { success: false, reason: 'service_not_available' };
    }
    const { appointmentStart, appointmentEnd } =
      this.appointmentFactory.buildAppointmentTimes(
        data.preferred_start,
        service.duration_minutes
      );
    const resolution = await this.assignmentResolver.resolve({
      clinic_id: data.clinic_id,
      branch_id: data.branch_id,
      service_id: service.id,
      doctor_id: data.doctor_id || null,
      room_id: data.room_id || null,
      appointment_start: appointmentStart,
      appointment_end: appointmentEnd,
      patient_id: data.patient_id || null,
      excludeAppointmentId: data.excludeAppointmentId || null,
    });
    if (!resolution.resolved) {
      return {
        success: false,
        reason: resolution.availability?.reason || resolution.reason || 'technical_failure',
        availability: resolution.availability,
      };
    }
    return {
      success: true,
      availability: resolution.availability,
      assignment: resolution.assignment,
    };
  }

  async getAvailableDates(data = {}) {
    const clinic = await this.repositories.clinics.findById(data.clinic_id);
    if (!clinic || clinic.is_active !== true || !clinic.timezone) {
      return { success: false, reason: 'clinic_not_found', dates: [] };
    }
    const branch = await this.repositories.branches.findActiveById(
      data.clinic_id,
      data.branch_id
    );
    const service = await this.repositories.services.findActiveById(
      data.clinic_id,
      data.service_id
    );
    if (!branch || !service || service.is_booking_enabled !== true) {
      return { success: false, reason: 'booking_context_not_found', dates: [] };
    }
    const intervalMinutes = positiveInteger(
      service.duration_minutes,
      Number(service.duration_minutes)
    );
    const searchDays = boundedInteger(data.search_days, 30, 1, 31);
    const limit = boundedInteger(data.limit, 10, 1, 31);
    const fromDate = parseIsoDate(data.from_date);
    if (!fromDate) {
      return { success: false, reason: 'invalid_from_date', dates: [] };
    }
    const now = new Date();
    const earliestStart = now;
    const windowStart = zonedLocalToDate(fromDate, 0, clinic.timezone);
    const windowEnd = zonedLocalToDate(
      addUtcDays(fromDate, searchDays),
      0,
      clinic.timezone
    );
    const window = await this.repositories.serviceAssignments
      .findAvailabilityWindow({
        clinicId: data.clinic_id,
        branchId: data.branch_id,
        serviceId: service.id,
        doctorId: data.doctor_id || null,
        roomId: data.room_id || null,
        windowStart,
        windowEnd,
        timeZone: clinic.timezone,
        excludeAppointmentId: data.excludeAppointmentId || null,
      });
    const assignments = window.assignments || [];
    if (!assignments.length) {
      return { success: true, dates: [] };
    }
    const dates = [];
    for (let offset = 0; offset < searchDays && dates.length < limit; offset += 1) {
      const date = addUtcDays(fromDate, offset);
      const slots = availableSlotsForDate({
        date,
        branchId: data.branch_id,
        timeZone: clinic.timezone,
        durationMinutes: Number(service.duration_minutes),
        intervalMinutes,
        earliestStart,
        assignments,
        window,
      });
      if (slots.length) dates.push(date);
    }
    return { success: true, dates };
  }

  async getAvailableTimes(data = {}) {
    const date = parseIsoDate(data.date);
    if (!date) return { success: false, reason: 'invalid_date', times: [] };
    const clinic = await this.repositories.clinics.findById(data.clinic_id);
    const branch = await this.repositories.branches.findActiveById(
      data.clinic_id,
      data.branch_id
    );
    const service = await this.repositories.services.findActiveById(
      data.clinic_id,
      data.service_id
    );
    if (
      !clinic || clinic.is_active !== true || !clinic.timezone ||
      !branch || !service || service.is_booking_enabled !== true
    ) {
      return { success: false, reason: 'booking_context_not_found', times: [] };
    }
    const windowStart = zonedLocalToDate(date, 0, clinic.timezone);
    const windowEnd = zonedLocalToDate(addUtcDays(date, 1), 0, clinic.timezone);
    const window = await this.repositories.serviceAssignments
      .findAvailabilityWindow({
        clinicId: data.clinic_id,
        branchId: data.branch_id,
        serviceId: service.id,
        doctorId: data.doctor_id || null,
        roomId: data.room_id || null,
        windowStart,
        windowEnd,
        timeZone: clinic.timezone,
        excludeAppointmentId: data.excludeAppointmentId || null,
      });
    const assignments = window.assignments || [];
    if (!assignments.length) return { success: true, times: [] };
    const times = availableSlotsForDate({
      date,
      branchId: data.branch_id,
      timeZone: clinic.timezone,
      durationMinutes: Number(service.duration_minutes),
      intervalMinutes: positiveInteger(
        service.duration_minutes,
        Number(service.duration_minutes)
      ),
      earliestStart: new Date(),
      assignments,
      window,
    }).map(({ time }) => time);
    return { success: true, times };
  }

  async getAvailableAlternatives(data = {}) {
    const requested = new Date(data.preferred_start);
    const clinic = await this.repositories.clinics.findById(data.clinic_id);
    if (Number.isNaN(requested.getTime()) || !clinic?.timezone) {
      return { success: false, reason: 'invalid_preferred_start', alternatives: [] };
    }
    const limit = boundedInteger(data.limit, 3, 1, 3);
    const requestedDate = localIsoDate(requested, clinic.timezone);
    const requestedMinute = localMinute(requested, clinic.timezone);
    const context = {
      clinic_id: data.clinic_id,
      service_id: data.service_id,
      branch_id: data.branch_id,
      doctor_id: data.doctor_id || null,
    };
    const sameDay = await this.getAvailableTimes({ ...context, date: requestedDate });
    const alternatives = (sameDay.times || [])
      .map((time) => ({ date: requestedDate, time }))
      .filter(({ time }) => timeToMinutes(time) !== requestedMinute)
      .sort((first, second) =>
        Math.abs(timeToMinutes(first.time) - requestedMinute) -
        Math.abs(timeToMinutes(second.time) - requestedMinute) ||
        first.time.localeCompare(second.time)
      )
      .slice(0, limit);
    if (alternatives.length < limit) {
      const dates = await this.getAvailableDates({
        ...context,
        from_date: addUtcDays(requestedDate, 1),
        search_days: 30,
        limit,
      });
      for (const date of dates.dates || []) {
        const available = await this.getAvailableTimes({ ...context, date });
        for (const time of available.times || []) {
          alternatives.push({ date, time });
          if (alternatives.length === limit) break;
        }
        if (alternatives.length === limit) break;
      }
    }
    return { success: true, alternatives };
  }

  async getPreferredAvailability(data = {}) {
    const clinic = await this.repositories.clinics.findById(data.clinic_id);
    const branch = await this.repositories.branches.findActiveById(
      data.clinic_id,
      data.branch_id
    );
    const service = await this.repositories.services.findActiveById(
      data.clinic_id,
      data.service_id
    );
    const from = new Date(data.from);
    if (
      !clinic?.timezone || !branch || !service ||
      service.is_booking_enabled !== true || Number.isNaN(from.getTime())
    ) {
      return { success: false, reason: 'booking_context_not_found' };
    }
    const requestedDate = data.mode === 'any_time'
      ? parseIsoDate(data.date)
      : localIsoDate(from, clinic.timezone);
    if (!requestedDate) {
      return { success: false, reason: 'invalid_preference_date' };
    }
    const searchDays = data.mode === 'any_time' ? 1 : 31;
    const windowStart = zonedLocalToDate(requestedDate, 0, clinic.timezone);
    const windowEnd = zonedLocalToDate(
      addUtcDays(requestedDate, searchDays),
      0,
      clinic.timezone
    );
    const window = await this.repositories.serviceAssignments
      .findAvailabilityWindow({
        clinicId: data.clinic_id,
        branchId: data.branch_id,
        serviceId: service.id,
        doctorId: data.doctor_id || null,
        roomId: data.room_id || null,
        windowStart,
        windowEnd,
        timeZone: clinic.timezone,
        excludeAppointmentId: data.excludeAppointmentId || null,
      });
    const assignments = window.assignments || [];
    const intervalMinutes = positiveInteger(
      service.duration_minutes,
      Number(service.duration_minutes)
    );
    for (let offset = 0; offset < searchDays; offset += 1) {
      const date = addUtcDays(requestedDate, offset);
      const slot = availableSlotsForDate({
        date,
        branchId: data.branch_id,
        timeZone: clinic.timezone,
        durationMinutes: Number(service.duration_minutes),
        intervalMinutes,
        earliestStart: from,
        assignments,
        window,
      })[0];
      if (slot) {
        return {
          success: true,
          preferredStart: slot.appointmentStart.toISOString(),
          date,
          time: slot.time,
          doctorId: slot.assignment.doctor_id || null,
          roomId: slot.assignment.room_id || null,
        };
      }
    }
    return {
      success: false,
      reason: 'no_available_slot',
      unavailableReason: unavailableDateReason(
        window,
        requestedDate,
        data.branch_id
      ),
      date: requestedDate,
      recoveryStart: zonedLocalToDate(requestedDate, 0, clinic.timezone).toISOString(),
    };
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number >= minimum && number <= maximum
    ? number
    : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function addUtcDays(value, count) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function holidayForDate(holidays = [], date, branchId) {
  const matches = holidays.filter((holiday) =>
    String(holiday.holiday_date).slice(0, 10) === date
  );
  return matches.find((holiday) => holiday.branch_id === branchId) ||
    matches.find((holiday) => holiday.branch_id == null) || null;
}

function unavailableDateReason(window, date, branchId) {
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const hours = (window.branch_hours || []).find(
    (item) => Number(item.day_of_week) === dayOfWeek
  );
  const holiday = holidayForDate(window.holidays, date, branchId);
  return !hours || hours.is_closed === true || holiday?.is_closed === true
    ? 'closed_day'
    : 'no_availability';
}

function availableSlotsForDate({
  date,
  branchId,
  timeZone,
  durationMinutes,
  intervalMinutes,
  earliestStart,
  assignments,
  window,
}) {
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const hours = (window.branch_hours || []).find(
    (item) => Number(item.day_of_week) === dayOfWeek
  );
  if (!hours || hours.is_closed === true) return [];
  const opensAt = timeToMinutes(hours.opens_at);
  const closesAt = timeToMinutes(hours.closes_at);
  if (
    opensAt === null || closesAt === null ||
    !Number.isFinite(durationMinutes) || durationMinutes <= 0
  ) return [];
  const holiday = holidayForDate(window.holidays, date, branchId);
  if (holiday?.is_closed === true) return [];
  const effectiveOpen = holiday?.opens_at
    ? Math.max(opensAt, timeToMinutes(holiday.opens_at))
    : opensAt;
  const effectiveClose = holiday?.closes_at
    ? Math.min(closesAt, timeToMinutes(holiday.closes_at))
    : closesAt;
  const slots = [];
  for (
    let minute = effectiveOpen;
    minute + durationMinutes <= effectiveClose;
    minute += intervalMinutes
  ) {
    const appointmentStart = zonedLocalToDate(date, minute, timeZone);
    if (appointmentStart < earliestStart) continue;
    const appointmentEnd = new Date(
      appointmentStart.getTime() + durationMinutes * 60 * 1000
    );
    const assignment = assignments.find((candidate) => assignmentAvailableInWindow(
      candidate,
      dayOfWeek,
      appointmentStart,
      appointmentEnd,
      window
    ));
    if (assignment) {
      slots.push({
        time: `${padTime(Math.floor(minute / 60))}:${padTime(minute % 60)}`,
        appointmentStart,
        assignment,
      });
    }
  }
  return slots;
}

function padTime(value) {
  return String(value).padStart(2, '0');
}

function assignmentAvailableInWindow(
  assignment,
  dayOfWeek,
  start,
  end,
  window
) {
  if (assignment.requires_doctor && !assignment.doctor_id) return false;
  if (assignment.requires_room && !assignment.room_id) return false;
  if (assignment.doctor_id) {
    const withinDoctorHours = (window.doctor_hours || []).some((hours) =>
      hours.doctor_id === assignment.doctor_id &&
      Number(hours.day_of_week) === dayOfWeek &&
      timeToMinutes(hours.start_time) <= localMinute(start, window.time_zone) &&
      timeToMinutes(hours.end_time) >= localMinute(end, window.time_zone)
    );
    if (!withinDoctorHours) return false;
    if (overlapsResourceWindow(
      window.doctor_time_off,
      'doctor_id',
      assignment.doctor_id,
      start,
      end
    )) return false;
    if (overlapsAppointments(window.appointments, 'doctor_id', assignment.doctor_id, start, end)) {
      return false;
    }
  }
  if (assignment.room_id) {
    if (overlapsResourceWindow(
      window.room_time_off,
      'room_id',
      assignment.room_id,
      start,
      end
    )) return false;
    if (overlapsAppointments(window.appointments, 'room_id', assignment.room_id, start, end)) {
      return false;
    }
  }
  return true;
}

function overlapsResourceWindow(rows = [], field, id, start, end) {
  return rows.some((row) => row[field] === id && overlaps(
    row.start_datetime,
    row.end_datetime,
    start,
    end
  ));
}

function overlapsAppointments(rows = [], field, id, start, end) {
  return rows.some((row) => row[field] === id && overlaps(
    row.appointment_start,
    row.appointment_end,
    start,
    end
  ));
}

function overlaps(existingStart, existingEnd, start, end) {
  return new Date(existingStart) < end && new Date(existingEnd) > start;
}

function localMinute(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function localIsoDate(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function zonedLocalToDate(date, minuteOfDay, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  let timestamp = Date.UTC(year, month - 1, day, hour, minute);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)])
    );
    const actual = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute
    );
    timestamp += Date.UTC(year, month - 1, day, hour, minute) - actual;
  }
  return new Date(timestamp);
}

module.exports = BookingOrchestrator;
