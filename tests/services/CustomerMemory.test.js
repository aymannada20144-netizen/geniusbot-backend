'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ContextProvider = require('../../src/services/shaden/ShadenConversationContextProvider');
const CustomerMemoryRepository = require('../../src/repositories/CustomerMemoryRepository');
const { systemPrompt } = require('../../src/services/shaden/conversation/ShadenConversationLayer');

test('new session loads scoped memory without restoring operational state', async () => {
  const provider = new ContextProvider({
    patientService: { async resolveChannelIdentity() { return { id: 'patient-1', full_name: 'Noura' }; } },
    customerMemoryRepository: { async listActive() { return [{
      memoryKey: 'discussed_service:service-1', memoryType: 'discussed_service',
      value: { serviceId: 'service-1' }, evidenceLevel: 'contextual',
    }]; } },
  });
  const context = await provider.load({ clinicId: 'clinic-1', channelIdentity: '+966500000001',
    conversation: { patientId: 'patient-1', statePayload: { shaden: { priceInquiry: { pendingSlot: 'bookingConfirmation' } } } } });
  assert.equal(context.customerMemory.recentTopics[0].value.serviceId, 'service-1');
  assert.equal('priceInquiry' in context.customerMemory, false);
  assert.equal('booking' in context.customerMemory, false);
});

test('memory is not loaded across clinic boundaries', async () => {
  const calls = [];
  const provider = new ContextProvider({
    patientService: { async resolveChannelIdentity(clinicId) { return clinicId === 'clinic-a' ? { id: 'patient-a', full_name: 'A' } : null; } },
    customerMemoryRepository: { async listActive(input) { calls.push(input); return []; } },
  });
  await provider.load({ clinicId: 'clinic-a', channelIdentity: '+966500000001', conversation: { patientId: 'patient-a' } });
  await provider.load({ clinicId: 'clinic-b', channelIdentity: '+966500000001', conversation: { patientId: null } });
  assert.deepEqual(calls, [{ clinicId: 'clinic-a', patientId: 'patient-a' }]);
});

test('confirmed branch and insurance memories remain context only, never operational slots', async () => {
  const provider = new ContextProvider({
    patientService: { async resolveChannelIdentity() { return { id: 'patient-1', full_name: 'Noura' }; } },
    customerMemoryRepository: { async listActive() { return [
      { memoryKey: 'branch:branch-1', memoryType: 'confirmed_branch', value: { branchId: 'branch-1' }, evidenceLevel: 'structured' },
      { memoryKey: 'insurance:company-1', memoryType: 'previous_insurance_company_used', value: { insuranceCompanyId: 'company-1' }, evidenceLevel: 'structured' },
    ]; } },
  });
  const context = await provider.load({ clinicId: 'clinic-1', channelIdentity: '+966500000001',
    conversation: { patientId: 'patient-1' } });
  assert.equal(context.customerMemory.confirmedPreferences.length, 2);
  assert.equal('branchId' in context, false);
  assert.equal('insuranceCompanyId' in context, false);
  assert.equal('insuranceClassId' in context, false);
});

test('repository reconciliation uses a scoped active-memory upsert and structured values only', async () => {
  const calls = [];
  const repository = new CustomerMemoryRepository({ async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('SET active = false')) return { rows: [] };
    return { rows: [{ id: 'memory-1', memoryKey: params[2], memoryType: params[3], value: JSON.parse(params[4]), active: true }] };
  } });
  const stored = await repository.reconcile({ clinicId: 'clinic-1', patientId: 'patient-1',
    memoryKey: 'discussed_service:service-1', memoryType: 'discussed_service',
    value: { serviceId: 'service-1' }, sourceConversationId: 'conversation-1', sourceMessageId: 'message-1' });
  assert.equal(stored.memoryKey, 'discussed_service:service-1');
  assert.match(calls[0].sql, /ON CONFLICT \(clinic_id, patient_id, memory_key\) WHERE active = true/u);
  await repository.supersede({ clinicId: 'clinic-1', patientId: 'patient-1',
    memoryType: 'confirmed_branch', replacementKey: 'branch:branch-2' });
  assert.match(calls[1].sql, /SET active = false/u);
  await assert.rejects(() => repository.reconcile({ clinicId: 'clinic-1' }), /supported structured fact/u);
});

test('conversational memory prompt is prior-reference-only and ambiguity-safe', () => {
  const prompt = systemPrompt({ clinic: { name: 'Clinic' } }, {
    recentTopics: [{ serviceName: 'Laser' }, { serviceName: 'Skin care' }],
  });
  assert.match(prompt, /Laser، Skin care/u);
  assert.match(prompt, /صراحةً إلى حديث سابق/u);
  assert.match(prompt, /تعددت المواضيع/u);
  assert.match(prompt, /لا تذكريه في التحية العادية/u);
  assert.match(prompt, /لا تعيدي تشغيل أي حجز أو تسعير/u);
});
