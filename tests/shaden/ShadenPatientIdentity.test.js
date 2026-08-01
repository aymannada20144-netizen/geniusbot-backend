'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const ShadenConversationContextProvider = require(
  '../../src/services/shaden/ShadenConversationContextProvider'
);

const clinicData = {
  clinic: { name: 'عيادات أوريان' },
  assistantIdentity: { name: 'إسراء', gender: 'female' },
  branches: [], specialties: [], services: [], paymentMethods: [],
  insuranceCompanies: [], insuranceClasses: [], workingHours: [],
};

describe('Shaden patient identity priority', () => {
  test('registered patient name overrides stale conversation name', async () => {
    const result = await reply({ persistedName: 'فردوس', canonicalName: 'منة' });
    assert.match(result.reply, /منة/);
    assert.doesNotMatch(result.reply, /فردوس/);
    assert.equal(result.nextState.customer.name, 'فردوس');
  });

  test('registered patient name overrides stale booking draft name', async () => {
    const state = baseState('فردوس');
    state.booking = validBooking();
    state.booking.full_name = 'فردوس';
    const result = await reply({ state, canonicalName: 'منة', text: 'من معي' });
    assert.match(result.reply, /منة/);
    assert.equal(state.booking.full_name, 'فردوس');
  });

  test('unknown sender may use current-conversation temporary name only', async () => {
    const result = await reply({ persistedName: 'سارة', canonicalName: null });
    assert.match(result.reply, /سارة/);
  });

  test('no cross-conversation name leakage', async () => {
    const oldConversation = await reply({ persistedName: 'فردوس' });
    const currentConversation = await reply({ persistedName: null });
    assert.match(oldConversation.reply, /فردوس/);
    assert.doesNotMatch(currentConversation.reply, /فردوس/);
  });

  test('no cross-patient leakage', async () => {
    assert.match((await reply({ persistedName: 'فردوس', canonicalName: 'منة' })).reply, /منة/);
    assert.match((await reply({ persistedName: 'منة', canonicalName: 'نورة' })).reply, /نورة/);
  });

  test('conversation.patient_id mismatch fails closed', async () => {
    const provider = providerFor({ id: 'patient-current', full_name: 'منة' });
    await assert.rejects(
      provider.load({
        clinicId: 'clinic-1',
        channelIdentity: '+966500000001',
        conversation: { patientId: 'patient-other' },
      }),
      (error) => error.code === 'CONVERSATION_PATIENT_MISMATCH'
    );
  });

  test('returning WhatsApp patient uses canonical DB name', async () => {
    const context = await providerFor({ id: 'patient-1', full_name: 'منة' }).load({
      clinicId: 'clinic-1', channelIdentity: '+966500000001',
      conversation: { patientId: 'patient-1' },
    });
    assert.equal(context.customerName, 'منة');
    assert.equal(context.customerNameSource, 'patients.full_name');
  });

  test('editing patient name through official Patient API appears on next message', async () => {
    const patient = { id: 'patient-1', full_name: 'منة' };
    const provider = providerFor(patient);
    const input = { clinicId: 'clinic-1', channelIdentity: '+966500000001', conversation: { patientId: 'patient-1' } };
    assert.equal((await provider.load(input)).customerName, 'منة');
    patient.full_name = 'منة محمد';
    assert.equal((await provider.load(input)).customerName, 'منة محمد');
  });

  test('Context Provider performs no patient mutation', async () => {
    const patient = { id: 'patient-1', full_name: 'منة', notes: 'unchanged' };
    const before = structuredClone(patient);
    await providerFor(patient).load({
      clinicId: 'clinic-1', channelIdentity: '+966500000001',
      conversation: { patientId: 'patient-1' },
    });
    assert.deepEqual(patient, before);
  });

  test('booking state remains intact after side identity inquiry', async () => {
    const state = baseState('فردوس');
    state.booking = validBooking();
    const before = structuredClone(state.booking);
    const result = await reply({ state, canonicalName: 'منة', text: 'من معي' });
    assert.deepEqual(result.nextState.booking, before);
    assert.match(result.reply, /إسراء.*منة/);
  });

  test('Assistant Identity remains independent from Patient Identity', async () => {
    const result = await reply({ persistedName: 'فردوس', canonicalName: 'منة', text: 'من معي' });
    assert.match(result.reply, /إسراء/);
    assert.match(result.reply, /منة/);
  });
});

function providerFor(patient) {
  return new ShadenConversationContextProvider({
    patientRepository: {
      findByClinicAndChannelIdentity: async () => patient || null,
    },
  });
}

async function reply({
  persistedName = null,
  canonicalName = null,
  state = null,
  text = 'هل انتي معي',
} = {}) {
  return new ShadenEngine().handle({
    message: { text },
    currentState: state || baseState(persistedName),
    clinicData,
    patientIdentity: canonicalName ? {
      patient: { id: 'patient-1', fullName: canonicalName },
      customerName: canonicalName,
      customerNameSource: 'patients.full_name',
    } : { patient: null, customerName: null },
  });
}

function baseState(name) {
  return {
    version: 1, mode: 'idle', step: null,
    customer: { name }, context: null, options: [],
  };
}

function validBooking() {
  return {
    step: 'service', serviceId: null, city: null, branchId: null,
    doctorId: null, preferredStart: null, paymentMethodId: null,
    insuranceCompanyId: null, insuranceClassId: null,
  };
}
