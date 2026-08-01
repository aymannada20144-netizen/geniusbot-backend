const {
  ValidationError,
} = require('../../core/errors');

const {
  validateUuid,
  validateRequired,
} = require('../../core/validators/commonValidators');

class BookingValidator {
  validateBookingInput(data = {}) {
    validateRequired(data, 'data');

    validateUuid(data.clinic_id, 'clinic_id');
    validateUuid(data.service_id, 'service_id');
    validateUuid(data.branch_id, 'branch_id');

    validateRequired(
      data.preferred_start,
      'preferred_start'
    );
    validateUuid(data.payment_method_id, 'payment_method_id');

    if (data.confirmed !== true) {
      throw new ValidationError(
        'Explicit booking confirmation is required.'
      );
    }

    if (data.patient_id) {
      validateUuid(data.patient_id, 'patient_id');
    } else {
      validateRequired(
        data.phone_number,
        'phone_number'
      );
    }
  }

  validateAppointmentStart(appointmentStart) {
    if (Number.isNaN(appointmentStart.getTime())) {
      throw new ValidationError(
        'Invalid preferred_start date.'
      );
    }
  }
}

module.exports = BookingValidator;
