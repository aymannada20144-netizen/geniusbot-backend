'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const PatientService = require('../../src/modules/patients/PatientService');
const { ValidationError } = require('../../src/core/errors');

const clinicId = '00000000-0000-0000-0000-000000000001';
const patientId = '00000000-0000-0000-0000-000000000002';

function repository(overrides = {}) {
  return {
    findByClinicAndPhone: async () => null,
    findByClinicAndWhatsApp: async () => null,
    findByClinicAndId: async () => ({ id: patientId, clinic_id: clinicId }),
    createPatient: async (data) => ({ id: patientId, ...data }),
    updatePatient: async (_clinicId, id, data) => ({ id, clinic_id: clinicId, ...data }),
    ...overrides,
  };
}

describe('Patient management', () => {
  test('creates with the authenticated route clinic and rejects body clinic reassignment', async () => {
    let written;
    const service = new PatientService(repository({
      createPatient: async (data) => {
        written = data;
        return { id: patientId, ...data };
      },
    }));

    await assert.rejects(() => service.createPatient(clinicId, {
      clinic_id: '00000000-0000-0000-0000-000000000099',
      full_name: '  Sara Patient  ',
      phone_number: '+966500000001',
    }), /Unsupported patient field/);

    await service.createPatient(clinicId, {
      full_name: '  Sara Patient  ',
      phone_number: '+966500000001',
    });
    assert.equal(written.clinic_id, clinicId);
    assert.equal(written.full_name, 'Sara Patient');
    assert.equal(written.source, 'unknown');
    assert.equal(Object.hasOwn(written, 'unexpected'), false);
  });

  test('normalizes supported Saudi mobile formats to the stored +966 format', async () => {
    let written;
    const service = new PatientService(repository({
      createPatient: async (data) => {
        written = data;
        return { id: patientId, ...data };
      },
    }));

    await service.createPatient(clinicId, {
      full_name: 'Sara',
      phone_number: '05 6111-1111',
      whatsapp_id: '(966) 56 111 1111',
      gender: 'female',
    });

    assert.equal(written.phone_number, '+966561111111');
    assert.equal(written.whatsapp_id, '+966561111111');
  });

  test('restricts dashboard patient gender to female or male', async () => {
    const service = new PatientService(repository());
    await assert.rejects(
      service.createPatient(clinicId, {
        full_name: 'Sara',
        phone_number: '+966500000001',
        gender: 'unspecified',
      }),
      /gender must be female or male/
    );
  });

  test('rejects invalid Saudi phone values before writing', async () => {
    const service = new PatientService(repository());
    await assert.rejects(
      service.createPatient(clinicId, {
        full_name: 'Sara',
        phone_number: '123',
      }),
      ValidationError
    );
  });

  test('rejects duplicate phone values', async () => {
    const service = new PatientService(repository({
      findByClinicAndPhone: async () => ({ id: 'existing' }),
    }));
    await assert.rejects(
      service.createPatient(clinicId, {
        full_name: 'Sara',
        phone_number: '+966500000001',
      }),
      (error) => error.code === 'PATIENT_PHONE_DUPLICATE'
    );
  });

  test('updates only a patient owned by the active clinic', async () => {
    const service = new PatientService(repository());
    const updated = await service.updatePatient(clinicId, patientId, {
      full_name: ' Updated Name ',
    });
    assert.equal(updated.clinic_id, clinicId);
    assert.equal(updated.full_name, 'Updated Name');
  });

  test('rejects unknown update fields and uses a strict status payload', async () => {
    const service = new PatientService(repository({
      setActiveStatus: async (_clinicId, id, active) => ({
        id, clinic_id: clinicId, is_active: active,
      }),
    }));
    await assert.rejects(
      service.updatePatient(clinicId, patientId, { created_at: 'now' }),
      /Unsupported patient field/
    );
    await assert.rejects(
      service.setActiveStatus(clinicId, patientId, { is_active: 'false' }),
      (error) => error.code === 'PATIENT_STATUS_INVALID'
    );
    const inactive = await service.setActiveStatus(
      clinicId, patientId, { is_active: false }
    );
    const active = await service.setActiveStatus(
      clinicId, patientId, { is_active: true }
    );
    assert.equal(inactive.id, patientId);
    assert.equal(inactive.is_active, false);
    assert.equal(active.id, patientId);
    assert.equal(active.is_active, true);
  });

  test('deletes only unused patients and returns a stable blocker error', async () => {
    const deletable = new PatientService(repository({
      deleteSafely: async () => ({
        patient: { id: patientId, clinic_id: clinicId },
        blockers: [],
      }),
    }));
    assert.equal((await deletable.deletePatient(clinicId, patientId)).id, patientId);

    const blocked = new PatientService(repository({
      deleteSafely: async () => ({
        patient: { id: patientId, clinic_id: clinicId },
        blockers: ['appointments', 'conversations'],
      }),
    }));
    await assert.rejects(
      blocked.deletePatient(clinicId, patientId),
      (error) => error.code === 'PATIENT_DELETE_BLOCKED' &&
        error.statusCode === 409
    );
  });

  test('dashboard exposes lifecycle actions, status filtering, and phone confirmation', () => {
    const page = fs.readFileSync(
      path.join(__dirname, '../../geniusbot-dashboard/src/pages/dashboard/PatientsPage.tsx'),
      'utf8'
    );
    assert.match(page, /View \/ Edit/);
    assert.match(page, /Filter by status/);
    assert.match(page, /Deactivate this patient/);
    assert.match(page, /Reactivate/);
    assert.match(page, /Permanently delete this patient/);
    assert.match(page, /identifies this patient in WhatsApp/);
    assert.match(page, /disabled=\{save\.isPending\}/);
  });

  test('maps Staff, Reports, and Settings to dedicated components', () => {
    const routes = fs.readFileSync(
      path.join(__dirname, '../../geniusbot-dashboard/src/routes/AppRoutes.tsx'),
      'utf8'
    );
    assert.match(routes, /path="staff" element={<StaffPage \/>}/);
    assert.match(
      routes,
      /path="reports" element={<ReportsPermissionGuard><ReportsPage \/><\/ReportsPermissionGuard>}/
    );
    assert.match(routes, /path="settings" element={<SettingsPage \/>}/);
    assert.doesNotMatch(routes, /path="(?:staff|reports|settings)" element={<DashboardHomePage \/>}/);
  });
});
