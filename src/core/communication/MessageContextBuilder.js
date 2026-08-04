'use strict';

const {
  TEMPLATE_PLACEHOLDER_VALUES,
} = require('../../contracts/communication');

const DEFAULT_TIMEZONE = 'Asia/Riyadh';
const DEFAULT_LOCALE = 'en-GB';

class MessageContextBuilder {
  build(
    source,
    {
      timezone,
      locale = DEFAULT_LOCALE,
    } = {}
  ) {
    this.#validateSource(source);
    this.#validateLocale(locale);

    const resolvedTimezone =
      timezone !== undefined
        ? timezone
        : this.#resolveSourceTimezone(source);

    this.#validateTimezone(resolvedTimezone);

    const appointmentStart =
      source.appointment?.appointment_start ??
      source.appointment?.appointmentStart ??
      null;

    const appointmentDate =
      appointmentStart === null
        ? null
        : this.#formatDate(
            appointmentStart,
            resolvedTimezone,
            locale
          );

    const appointmentTime =
      appointmentStart === null
        ? null
        : this.#formatTime(
            appointmentStart,
            resolvedTimezone,
            locale
          );

    const context = {
      patient_name: this.#cleanText(
        source.patient?.full_name ??
          source.patient?.fullName
      ),

      clinic_name: this.#cleanText(
        source.clinic?.name
      ),

      branch_name: this.#cleanText(
        source.branch?.name
      ),

      doctor_name: this.#buildDoctorName(
        source.doctor
      ),

      service_name: this.#cleanText(
        source.service?.name
      ),

      room_name: this.#cleanText(
        source.room?.room_name ??
          source.room?.roomName ??
          source.room?.name
      ),

      appointment_date: appointmentDate,

      appointment_time: appointmentTime,

      payment_method: this.#cleanText(
        source.paymentMethod?.name ??
          source.payment_method?.name ??
          source.appointment?.payment_method_name
      ),

      clinic_phone: this.#cleanText(
        source.clinic?.phone ??
          source.clinic?.whatsapp_number ??
          source.clinic?.whatsappNumber
      ),

      clinic_address: this.#cleanText(
        source.branch?.address ??
          source.clinic?.address
      ),

      google_review_url: this.#cleanText(
        source.google_review_url ??
          source.googleReviewUrl ??
          source.clinic?.google_review_url ??
          source.clinic?.googleReviewUrl
      ),

      booking_reference: this.#cleanText(
        source.appointment?.booking_reference ??
          source.appointment?.bookingReference
      ),
    };

    return Object.freeze({
      context: Object.freeze(context),
      timezone: resolvedTimezone,
      locale,
    });
  }

  #resolveSourceTimezone(source) {
    const branchTimezone =
      source.branch?.timezone;

    if (
      branchTimezone !== null &&
      branchTimezone !== undefined
    ) {
      return branchTimezone;
    }

    const clinicTimezone =
      source.clinic?.timezone;

    if (
      clinicTimezone !== null &&
      clinicTimezone !== undefined
    ) {
      return clinicTimezone;
    }

    return DEFAULT_TIMEZONE;
  }

  #buildDoctorName(doctor) {
    if (!doctor) {
      return null;
    }

    const fullName = this.#cleanText(
      doctor.full_name ?? doctor.fullName
    );

    if (!fullName) {
      return null;
    }

    const title = this.#cleanText(doctor.title);

    if (!title) {
      return fullName;
    }

    const normalizedTitle = title.replace(
      /\s+/g,
      ' '
    );

    const normalizedFullName = fullName.replace(
      /\s+/g,
      ' '
    );

    if (
      normalizedFullName === normalizedTitle ||
      normalizedFullName.startsWith(
        `${normalizedTitle} `
      )
    ) {
      return normalizedFullName;
    }

    return `${normalizedTitle} ${normalizedFullName}`;
  }

  #formatDate(value, timezone, locale) {
    const date = this.#toValidDate(value);

    if (locale.toLowerCase().startsWith('ar')) {
      const parts = new Intl.DateTimeFormat(
        locale,
        {
          timeZone: timezone,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }
      ).formatToParts(date);
      const valueFor = (type) =>
        parts.find((part) => part.type === type)?.value;
      return [
        valueFor('weekday'),
        valueFor('day'),
        valueFor('month'),
        valueFor('year'),
      ].filter(Boolean).join(' ');
    }

    const formatter = new Intl.DateTimeFormat(
      locale,
      {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }
    );

    return formatter.format(date);
  }

  #formatTime(value, timezone, locale) {
    const date = this.#toValidDate(value);

    if (locale.toLowerCase().startsWith('ar')) {
      const parts = new Intl.DateTimeFormat(
        locale,
        {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }
      ).formatToParts(date);
      const hour = parts.find((part) => part.type === 'hour')?.value;
      const minute = parts.find((part) => part.type === 'minute')?.value;
      const dayPeriod = parts.find(
        (part) => part.type === 'dayPeriod'
      )?.value;
      const period = dayPeriod === 'م'
        ? 'مساءً'
        : dayPeriod === 'ص'
          ? 'صباحًا'
          : dayPeriod;
      return `${hour}:${minute} ${period}`.trim();
    }

    const formatter = new Intl.DateTimeFormat(
      locale,
      {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }
    );

    return formatter.format(date);
  }

  #toValidDate(value) {
    const date =
      value instanceof Date
        ? new Date(value.getTime())
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new TypeError(
        'Appointment start must be a valid date.'
      );
    }

    return date;
  }

  #cleanText(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const cleaned = String(value)
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned === '' ? null : cleaned;
  }

  #validateSource(source) {
    if (
      source === null ||
      typeof source !== 'object' ||
      Array.isArray(source)
    ) {
      throw new TypeError(
        'Message context source must be an object.'
      );
    }
  }

  #validateLocale(locale) {
    if (
      typeof locale !== 'string' ||
      locale.trim() === ''
    ) {
      throw new TypeError(
        'Message context locale must be a non-empty string.'
      );
    }

    try {
      new Intl.DateTimeFormat(locale);
    } catch {
      throw new TypeError(
        'Message context locale is invalid.'
      );
    }
  }

  #validateTimezone(timezone) {
    if (
      typeof timezone !== 'string' ||
      timezone.trim() === ''
    ) {
      throw new TypeError(
        'Message context timezone must be a non-empty string.'
      );
    }

    try {
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
      });
    } catch {
      throw new TypeError(
        'Message context timezone is invalid.'
      );
    }
  }
}

module.exports = Object.freeze({
  MessageContextBuilder,
  DEFAULT_TIMEZONE,
  DEFAULT_LOCALE,
  MESSAGE_CONTEXT_KEYS:
    TEMPLATE_PLACEHOLDER_VALUES,
});
