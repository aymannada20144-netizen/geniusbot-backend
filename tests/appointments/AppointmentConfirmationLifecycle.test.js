'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const AppointmentService = require(
  '../../src/modules/appointments/AppointmentService'
);
const DashboardService = require(
  '../../src/modules/dashboard/DashboardService'
);
const MessageFactory = require(
  '../../src/communication/factories/MessageFactory'
);
const MessageTypes = require(
  '../../src/communication/types/MessageTypes'
);

const IDS = Object.freeze({
  clinic: '00000000-0000-0000-0000-000000000001',
  appointment: '00000000-0000-0000-0000-000000000002',
  patient: '00000000-0000-0000-0000-000000000003',
});

function createHarness(options = {}) {
  let status = options.status || 'pending';
  let sends = 0;
  let sendArguments = null;
  const repository = {
    findByIdAndClinic: async () => ({ id: IDS.appointment, status }),
    updateStatus: async (_clinicId, _appointmentId, next, expected) => {
      if (options.updateFails) return null;
      if (status !== expected) return null;
      status = next;
      return { id: IDS.appointment, status };
    },
    findPresentationById: async () => ({
      id: IDS.appointment,
      clinic_id: IDS.clinic,
      patient_id: IDS.patient,
      patient_phone: '+966 50 000 0001',
      patient_name: 'المريضة',
      service_name: 'كشف الجلدية',
      doctor_name: 'د. نوف',
      branch_name: 'فرع الروضة',
      room_number: '204',
      appointment_start: '2026-08-06T11:00:00.000Z',
      booking_reference: 'ABC12345',
      clinic_timezone: 'Asia/Riyadh',
      status,
    }),
  };
  const communicationService = {
    send: async (...args) => {
      sends += 1;
      sendArguments = args;
      if (options.sendThrows) throw new Error('Meta unavailable');
      if (options.sendFails) {
        return {
          success: false,
          status: 'failed',
          error: { code: 'META_REJECTED' },
        };
      }
      return {
        success: true,
        status: 'sent',
        transportResult: { messageId: 'wamid-1' },
      };
    },
  };
  const service = new AppointmentService(
    repository,
    communicationService
  );
  return {
    service,
    repository,
    getStatus: () => status,
    getSends: () => sends,
    getSendArguments: () => sendArguments,
  };
}

describe('centralized appointment confirmation lifecycle', () => {
  test('pending to confirmed sends exactly one Arabic confirmation payload', async () => {
    const harness = createHarness();
    const result = await harness.service.updateAppointmentStatus(
      IDS.clinic,
      IDS.appointment,
      'confirmed'
    );

    assert.equal(result.status, 'confirmed');
    assert.deepEqual(result.communication, {
      attempted: true,
      success: true,
      status: 'sent',
      messageId: 'wamid-1',
    });
    assert.equal(harness.getSends(), 1);
    const [type, payload] = harness.getSendArguments();
    assert.equal(type, MessageTypes.APPOINTMENT_CONFIRMATION);
    assert.deepEqual(payload, {
      phone: '966500000001',
      patientName: 'المريضة',
      serviceName: 'كشف الجلدية',
      doctorName: 'د. نوف',
      branchName: 'فرع الروضة',
      roomNumber: '204',
      appointmentDate: 'الخميس 6 أغسطس 2026',
      appointmentTime: '02:00 مساءً',
      appointmentNumber: 'ABC12345',
      appointmentId: IDS.appointment,
      patientId: IDS.patient,
      clinicId: IDS.clinic,
    });

    const message = MessageFactory.build(type, payload);
    assert.deepEqual(Object.keys(message.template.variables), [
      'patientName',
      'serviceName',
      'doctorName',
      'branchName',
      'roomNumber',
      'appointmentDate',
      'appointmentTime',
      'appointmentNumber',
    ]);
  });

  test('confirmed to confirmed sends nothing', async () => {
    const harness = createHarness({ status: 'confirmed' });
    const result = await harness.service.updateAppointmentStatus(
      IDS.clinic,
      IDS.appointment,
      'confirmed'
    );
    assert.equal(harness.getSends(), 0);
    assert.equal(result.communication.status, 'not_required');
  });

  test('pending to cancelled sends nothing', async () => {
    const harness = createHarness();
    const result = await harness.service.updateAppointmentStatus(
      IDS.clinic,
      IDS.appointment,
      'cancelled'
    );
    assert.equal(result.status, 'cancelled');
    assert.equal(harness.getSends(), 0);
    assert.equal(result.communication.status, 'not_required');
  });

  test('failed status update sends nothing', async () => {
    const harness = createHarness({ updateFails: true });
    await assert.rejects(
      harness.service.updateAppointmentStatus(
        IDS.clinic,
        IDS.appointment,
        'confirmed'
      )
    );
    assert.equal(harness.getSends(), 0);
  });

  test('thrown WhatsApp failure does not undo confirmed status', async () => {
    const harness = createHarness({ sendThrows: true });
    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await harness.service.updateAppointmentStatus(
        IDS.clinic,
        IDS.appointment,
        'confirmed'
      );
      assert.equal(harness.getStatus(), 'confirmed');
      assert.equal(result.status, 'confirmed');
      assert.equal(result.communication.status, 'failed');
    } finally {
      console.error = originalError;
    }
  });

  test('structured WhatsApp failure does not undo confirmed status', async () => {
    const harness = createHarness({ sendFails: true });
    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await harness.service.updateAppointmentStatus(
        IDS.clinic,
        IDS.appointment,
        'confirmed'
      );
      assert.equal(harness.getStatus(), 'confirmed');
      assert.deepEqual(result.communication, {
        attempted: true,
        success: false,
        status: 'failed',
        errorCode: 'META_REJECTED',
      });
    } finally {
      console.error = originalError;
    }
  });

  test('legacy dashboard action uses the same confirmation sender', async () => {
    const harness = createHarness();
    const dashboardService = new DashboardService(
      {},
      harness.service
    );
    const result = await dashboardService.updateAppointmentStatus(
      IDS.clinic,
      IDS.appointment,
      'confirmed'
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(harness.getSends(), 1);
    assert.equal(
      harness.getSendArguments()[0],
      MessageTypes.APPOINTMENT_CONFIRMATION
    );
  });
});
