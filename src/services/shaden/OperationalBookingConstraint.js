'use strict';

const ABANDON_ACTIVE_BOOKING_DRAFT = 'ABANDON_ACTIVE_BOOKING_DRAFT';

function abandonActiveBookingDraft({ semanticResult }) {
  const result = semanticResult?.result;
  if (
    semanticResult?.contractValid !== true ||
    result?.status !== 'UNDERSTOOD' ||
    result?.goal !== 'ACT' ||
    !Array.isArray(result.subjects) ||
    !Array.isArray(result.constraints)
  ) return null;

  const currentSubjects = result.subjects.filter(
    (subject) => subject?.source === 'CURRENT'
  );
  const currentConstraints = result.constraints.filter(
    (constraint) => constraint?.source === 'CURRENT'
  );

  const hasCurrentAppointment = currentSubjects.some(
    (subject) => subject?.kind === 'APPOINTMENT'
  );
  const hasCurrentNegative = currentConstraints.some(
    (constraint) => constraint?.kind === 'NEGATIVE'
  );

  if (!hasCurrentAppointment || !hasCurrentNegative) return null;
  if (currentSubjects.some((subject) => subject?.kind !== 'APPOINTMENT')) {
    return null;
  }
  if (currentConstraints.some((constraint) => constraint?.kind !== 'NEGATIVE')) {
    return null;
  }

  return Object.freeze({ kind: ABANDON_ACTIVE_BOOKING_DRAFT });
}

module.exports = Object.freeze({
  ABANDON_ACTIVE_BOOKING_DRAFT,
  abandonActiveBookingDraft,
});
