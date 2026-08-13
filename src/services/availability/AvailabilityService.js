const {
  ValidationError,
  validateUuid,
  validateRequired,
} = require('../../core/validators/commonValidators');

class AvailabilityService {
  constructor(repositories) {
    if (!repositories) {
      throw new Error(
        'AvailabilityService requires repositories'
      );
    }

    this.repositories = repositories;
  }

  /**
   * يحول وقت الموعد إلى تاريخ ووقت محليين
   * باستخدام المنطقة الزمنية الخاصة بالعيادة.
   *
   * أوقات العمل مخزنة كتوقيت محلي
   * من نوع time without time zone، لذلك لا يجوز
   * مقارنتها مباشرة بوقت UTC.
   */
  parseAppointmentDateTime(
    value,
    fieldName,
    timeZone
  ) {
    const date =
      value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new ValidationError(
        `${fieldName} must be a valid date.`
      );
    }

    if (
      typeof timeZone !== 'string' ||
      timeZone.trim() === ''
    ) {
      throw new ValidationError(
        'Clinic timezone is required.'
      );
    }

    let parts;

    try {
      parts = new Intl.DateTimeFormat(
        'en-CA',
        {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
          weekday: 'short',
        }
      ).formatToParts(date);
    } catch (error) {
      throw new ValidationError(
        'Clinic timezone is invalid.'
      );
    }

    const values = {};

    for (const part of parts) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    }

    const dayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const dayOfWeek = dayMap[values.weekday];

    if (dayOfWeek === undefined) {
      throw new Error(
        `Unable to determine day of week for ${fieldName}`
      );
    }

    return {
      date:
        `${values.year}-${values.month}-${values.day}`,
      time:
        `${values.hour}:${values.minute}:${values.second}`,
      dayOfWeek,
    };
  }

  normalizeDatabaseTime(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const time = String(value);

    const match = time.match(
      /^(\d{2}):(\d{2})(?::(\d{2}))?/
    );

    if (!match) {
      throw new Error(
        `Invalid database time value: ${time}`
      );
    }

    return (
      `${match[1]}:${match[2]}:` +
      `${match[3] || '00'}`
    );
  }

  async checkAppointmentAvailability(data = {}) {
    validateRequired(data, 'data');

    const {
      clinic_id,
      branch_id,
      doctor_id,
      room_id,
      requires_doctor = Boolean(doctor_id),
      requires_room = Boolean(room_id),
      appointment_start,
      appointment_end,
      patient_id = null,
      excludeAppointmentId = null,
    } = data;

    validateUuid(clinic_id, 'clinic_id');
    validateUuid(branch_id, 'branch_id');
    if (requires_doctor || doctor_id) validateUuid(doctor_id, 'doctor_id');
    if (requires_room || room_id) validateUuid(room_id, 'room_id');
    if (patient_id) validateUuid(patient_id, 'patient_id');
    if (excludeAppointmentId) {
      validateUuid(excludeAppointmentId, 'excludeAppointmentId');
    }

    validateRequired(
      appointment_start,
      'appointment_start'
    );

    validateRequired(
      appointment_end,
      'appointment_end'
    );

    const start = new Date(appointment_start);
    const end = new Date(appointment_end);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      throw new ValidationError(
        'Invalid appointment date.'
      );
    }

    if (start >= end) {
      throw new ValidationError(
        'appointment_end must be greater than appointment_start.'
      );
    }

    /*
     * نقرأ المنطقة الزمنية للعيادة لأن ساعات العمل
     * مخزنة كتوقيت محلي دون منطقة زمنية.
     */
    const clinic =
      await this.repositories.clinics.findById(
        clinic_id
      );

    if (!clinic || clinic.is_active !== true) {
      return {
        available: false,
        reason: 'clinic_not_found',
        message:
          'Clinic not found or inactive',
      };
    }

    const timeZone = clinic.timezone;

    if (!timeZone) {
      return {
        available: false,
        reason:
          'clinic_timezone_not_configured',
        message:
          'Clinic timezone is not configured',
      };
    }

    const startDateTime =
      this.parseAppointmentDateTime(
        start,
        'appointment_start',
        timeZone
      );

    const endDateTime =
      this.parseAppointmentDateTime(
        end,
        'appointment_end',
        timeZone
      );
const clinicHoliday =
      await this.repositories.clinics.findHoliday(
        clinic_id,
        branch_id,
        startDateTime.date
      );

    if (clinicHoliday) {
      if (clinicHoliday.is_closed) {
        return {
          available: false,
          reason: 'clinic_holiday',
          message:
            'Clinic is closed on the requested date',
        };
      }

      const holidayOpensAt =
        this.normalizeDatabaseTime(
          clinicHoliday.opens_at
        );

      const holidayClosesAt =
        this.normalizeDatabaseTime(
          clinicHoliday.closes_at
        );

      if (
        holidayOpensAt &&
        holidayClosesAt
      ) {
        const outsideHolidayHours =
          startDateTime.time < holidayOpensAt ||
          startDateTime.time >= holidayClosesAt ||
          endDateTime.time > holidayClosesAt;

        if (outsideHolidayHours) {
          return {
            available: false,
            reason:
              'outside_clinic_holiday_hours',
            message:
              'Appointment time is outside clinic holiday working hours',
          };
        }
      }
    }
    /*
     * Step 1:
     * التحقق من ساعات عمل الفرع.
     */
    const branchWorkingHoursRepository = this.repositories.branches ||
      this.repositories.clinics;
    const findWorkingHours = this.repositories.branches
      ? branchWorkingHoursRepository.findWorkingHours.bind(
        branchWorkingHoursRepository
      )
      : branchWorkingHoursRepository.findBranchWorkingHours.bind(
        branchWorkingHoursRepository
      );
    const branchWorkingHours = await findWorkingHours(
      branch_id,
      startDateTime.dayOfWeek
    );

    /*
     * Fail closed:
     * إذا لم توجد ساعات مسجلة لليوم،
     * فلا نسمح بالحجز.
     */
    if (!branchWorkingHours) {
      return {
        available: false,
        reason:
          'branch_working_hours_not_configured',
        message:
          'Branch working hours are not configured for this day',
      };
    }

    if (branchWorkingHours.is_closed) {
      return {
        available: false,
        reason: 'branch_closed',
        message:
          'Branch is closed on the requested day',
      };
    }

    const opensAt =
      this.normalizeDatabaseTime(
        branchWorkingHours.opens_at
      );

    const closesAt =
      this.normalizeDatabaseTime(
        branchWorkingHours.closes_at
      );

    if (!opensAt || !closesAt) {
      return {
        available: false,
        reason:
          'branch_working_hours_not_configured',
        message:
          'Branch opening and closing times are not configured for this day',
      };
    }

    /*
     * مؤقت للاختبار فقط.
     * سيُحذف بعد معرفة القيم الفعلية.
     */
    
    const appointmentSpansMultipleDays =
      startDateTime.date !== endDateTime.date;

    const startsBeforeOpening =
      startDateTime.time < opensAt;

    const startsAtOrAfterClosing =
      startDateTime.time >= closesAt;

    const endsAfterClosing =
      endDateTime.time > closesAt;

    const outsideBranchWorkingHours =
      appointmentSpansMultipleDays ||
      startsBeforeOpening ||
      startsAtOrAfterClosing ||
      endsAfterClosing;

    if (outsideBranchWorkingHours) {
      return {
        available: false,
        reason:
          'outside_branch_working_hours',
        message:
          'Appointment time is outside branch working hours',
      };
    }

    /*
     * Step 2:
     * التحقق من ساعات عمل الطبيب.
     */
    if (doctor_id) {
    const doctorWorkingHours =
      await this.repositories.doctors
        .getWorkingHours(
          clinic_id,
          doctor_id,
          branch_id,
          startDateTime.dayOfWeek,
          startDateTime.time,
          endDateTime.time
        );

    if (!doctorWorkingHours) {
      return {
        available: false,
        reason: 'doctor_not_working',
        message:
          'Doctor is not working on the requested day',
      };
    }

    const doctorStartsAt =
      this.normalizeDatabaseTime(
        doctorWorkingHours.start_time
      );

    const doctorEndsAt =
      this.normalizeDatabaseTime(
        doctorWorkingHours.end_time
      );

    if (!doctorStartsAt || !doctorEndsAt) {
      return {
        available: false,
        reason:
          'doctor_working_hours_not_configured',
        message:
          'Doctor working hours are not configured',
      };
    }

    const outsideDoctorWorkingHours =
      startDateTime.time < doctorStartsAt ||
      startDateTime.time >= doctorEndsAt ||
      endDateTime.time > doctorEndsAt;

    if (
      doctorWorkingHours.matches_requested_time === false ||
      (
        doctorWorkingHours.matches_requested_time === undefined &&
        outsideDoctorWorkingHours
      )
    ) {
      return {
        available: false,
        reason:
          'outside_doctor_working_hours',
        message:
          'Appointment time is outside doctor working hours',
      };
    }

    /*
     * Step 3:
     * التحقق من عطلات العيادة.
     */
    

    /*
     * Step 4:
     * التحقق من إجازة الطبيب.
     */
    const doctorTimeOff =
      await this.repositories.doctors.hasTimeOff(
        doctor_id,
        start,
        end
      );

    if (doctorTimeOff) {
      return {
        available: false,
        reason: 'doctor_time_off',
        message:
          'Doctor is unavailable during the requested time',
      };
    }
    }
        /*
     * Step 5:
     * التحقق من أن الغرفة مفعلة.
     */
    if (room_id) {
    const room =
      await this.repositories.rooms.findActiveById(
        room_id
      );

    if (!room) {
      return {
        available: false,
        reason: 'room_inactive',
        message:
          'Room not found or inactive',
      };
    }

    if (room.branch_id !== branch_id) {
      return {
        available: false,
        reason: 'room_branch_mismatch',
        message:
          'Room does not belong to the requested branch',
      };
    }

    /*
     * Step 6:
     * التحقق من صيانة الغرفة.
     */
    const roomTimeOff =
      await this.repositories.rooms.hasTimeOff(
        room_id,
        start,
        end
      );

    if (roomTimeOff) {
      return {
        available: false,
        reason: 'room_time_off',
        message:
          'Room is unavailable during the requested time',
      };
    }
    }
    const doctorConflict = doctor_id ?
      await this.repositories.appointments
        .hasDoctorConflict(
          doctor_id,
          start,
          end,
          excludeAppointmentId,
          clinic_id
        ) : false;

    if (doctorConflict) {
      return {
        available: false,
        reason: 'doctor_conflict',
        message:
          'Doctor already has another appointment at this time',
      };
    }

    const roomConflict = room_id ?
      await this.repositories.appointments
        .hasRoomConflict(
          room_id,
          start,
          end,
          excludeAppointmentId,
          clinic_id
        ) : false;

    if (roomConflict) {
      return {
        available: false,
        reason: 'room_conflict',
        message:
          'Room already has another appointment at this time',
      };
    }
    const patientConflict = patient_id &&
      typeof this.repositories.appointments.hasPatientConflict === 'function'
      ? await this.repositories.appointments.hasPatientConflict(
        clinic_id, patient_id, start, end, excludeAppointmentId
      )
      : false;
    if (patientConflict) {
      return {
        available: false,
        reason: 'patient_conflict',
        message: 'Patient already has another appointment at this time',
      };
    }

    return {
      available: true,
      reason: null,
      message:
        'Appointment slot is available',
    };
  }
}

module.exports = AvailabilityService;
