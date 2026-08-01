'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const createShadenEngine = require(
  '../../src/services/shaden/createShadenEngine'
);
const ConversationRepository = require(
  '../../src/repositories/ConversationRepository'
);

describe('Shaden Phase 1.2 public runtime', () => {
  test('reuses one anonymous conversation through the real repository', async () => {
    const database = createConversationDatabase();
    const repository = new ConversationRepository(database);
    const session = createRepositorySession(repository);

    const greeting = await session.send('هاي');
    assert.equal(database.conversations.length, 1);
    assert.equal(database.conversations[0].id, 'conversation-1');
    assert.equal(database.conversations[0].patient_id, null);
    assert.equal(
      database.conversations[0].state_payload.channelIdentity,
      '+966500000001'
    );
    assert.equal(
      database.conversations[0].state_payload.shaden.step,
      'customer_name'
    );

    const loadedBeforeName = JSON.parse(JSON.stringify(
      await repository.loadState('conversation-1')
    ));
    assert.equal(loadedBeforeName.data.shaden.step, 'customer_name');

    const captured = await session.send('إسراء');
    assert.equal(captured.conversationId, 'conversation-1');
    assert.equal(database.conversations.length, 1);
    assert.equal(
      database.conversations[0].state_payload.shaden.customer.name,
      'إسراء'
    );
    assert.equal(database.conversations[0].state_payload.shaden.step, null);

    const present = await session.send('هل انتي معي');
    assert.equal(present.conversationId, 'conversation-1');
    assert.equal(database.conversations.length, 1);
    assert.match(present.replyText, /إسراء/);

    const otherClinic = await repository.create({
      clinicId: 'clinic-2',
      channel: 'whatsapp',
      channelIdentity: '+966500000001',
    });
    const otherSender = await repository.create({
      clinicId: 'clinic-1',
      channel: 'whatsapp',
      channelIdentity: '+966500000003',
    });
    assert.notEqual(otherClinic.id, 'conversation-1');
    assert.notEqual(otherSender.id, 'conversation-1');
    assert.equal(
      (await repository.findActiveByChannelIdentity({
        clinicId: 'clinic-2',
        channel: 'whatsapp',
        channelIdentity: '+966500000001',
      })).id,
      otherClinic.id
    );
    assert.equal(
      (await repository.findActiveByChannelIdentity({
        clinicId: 'clinic-1',
        channel: 'whatsapp',
        channelIdentity: '+966500000003',
      })).id,
      otherSender.id
    );

    database.patients.push({
      id: '00000000-0000-0000-0000-000000000009',
      clinic_id: 'clinic-1',
      identity: '+966500000009',
    });
    database.conversations.push(conversationRow({
      id: 'conversation-linked',
      clinicId: 'clinic-1',
      patientId: '00000000-0000-0000-0000-000000000009',
      statePayload: {},
    }));
    assert.equal(
      (await repository.findActiveByChannelIdentity({
        clinicId: 'clinic-1',
        channel: 'whatsapp',
        channelIdentity: '+966500000009',
      })).id,
      'conversation-linked'
    );
  });

  test('captures a name through the serialized WhatsApp public entry', async () => {
    const session = createSession();

    const greeting = await session.send('هاي');
    assert.match(greeting.replyText, /ممكن أعرف اسمكِ؟/);
    assert.equal(
      (greeting.replyText.match(/أهلًا وسهلًا/g) || []).length,
      1
    );
    assert.equal(session.persisted().data.shaden.step, 'customer_name');

    session.reload();
    const loadedBeforeName = session.persisted();
    assert.equal(loadedBeforeName.data.shaden.step, 'customer_name');

    const captured = await session.send('إسراء');
    assert.equal(captured.replyText, [
      'أهلًا بيكِ يا إسراء، نورتينا 🌸',
      'كيف أقدر أساعدكِ؟',
    ].join('\n'));
    assert.doesNotMatch(captured.replyText, /لا أملك إجابة مؤكدة/);
    assert.equal(session.persisted().data.shaden.customer.name, 'إسراء');
    assert.equal(session.persisted().data.shaden.step, null);

    session.reload();
    const present = await session.send('هل انتي معي');
    assert.match(present.replyText, /إسراء/);
    assert.doesNotMatch(present.replyText, /أعرف اسمك/);

    for (const name of ['اسمي إسراء', 'منة']) {
      const independent = createSession();
      await independent.send('هاي');
      independent.reload();
      const result = await independent.send(name);
      const expected = name.replace(/^اسمي\s+/, '');
      assert.equal(result.state.data.shaden.customer.name, expected);
      assert.equal(result.state.data.shaden.step, null);
    }

    const inquiry = createSession();
    await inquiry.send('هاي');
    inquiry.reload();
    const services = await inquiry.send('ما الخدمات');
    assert.match(services.replyText, /إزالة الشعر بالليزر/);
    assert.equal(services.state.data.shaden.customer.name, null);
    assert.equal(services.state.data.shaden.step, 'customer_name');

    const phone = createSession();
    await phone.send('هاي');
    phone.reload();
    await phone.send('0501234567');
    assert.equal(phone.persisted().data.shaden.customer.name, null);
  });

  test('captures and preserves a customer name through independent webhook turns', async () => {
    const session = createSession();

    const greeting = await session.send('السلام عليكم');
    assert.equal(
      greeting.replyText,
      'وعليكم السلام ورحمة الله وبركاته 🌸\n' +
      'ممكن أعرف اسمكِ؟'
    );
    assert.deepEqual(greeting.state.data.shaden, {
      version: 1,
      mode: 'idle',
      step: 'customer_name',
      customer: { name: null },
      context: null,
      options: [],
    });

    const captured = await session.send('نورة');
    assert.equal(captured.state.data.shaden.customer.name, 'نورة');
    assert.equal(captured.state.data.shaden.step, null);
    assert.match(captured.replyText, /أهلًا بيكِ يا نورة، نورتينا/);

    const thanks = await session.send('شكرا');
    assert.match(thanks.replyText, /يا نورة/);
    assert.match(thanks.replyText, /أمركِ/);

    const reloadedGreeting = await session.send('السلام عليكم');
    assert.match(reloadedGreeting.replyText, /يا نورة/);
    assert.doesNotMatch(reloadedGreeting.replyText, /أعرف اسمك/);
    assert.equal(
      reloadedGreeting.state.data.shaden.customer.name,
      'نورة'
    );

    assert.deepEqual(reloadedGreeting.state.data.unrelated, {
      preserved: true,
    });
    assertSingleNameField(reloadedGreeting.state.data.shaden);
  });

  test('handles social intents without fallback and uses feminine language', async () => {
    const evening = createSession();
    assert.match(
      (await evening.send('مساء الخير')).replyText,
      /^مساء النور.*ممكن أعرف اسمك/s
    );
    const fullName = await evening.send('سارة محمد');
    assert.equal(fullName.state.data.shaden.customer.name, 'سارة محمد');

    const combined = createSession();
    const combinedReply = await combined.send('هاي كيفك');
    assert.match(combinedReply.replyText, /الحمد لله بخير/);
    assert.match(combinedReply.replyText, /ممكن أعرف اسمك/);
    assert.doesNotMatch(combinedReply.replyText, /لا أملك إجابة/);

    const presence = createSession();
    const presenceReply = await presence.send('هل انتي معي');
    assert.match(presenceReply.replyText, /نعم معاكِ شادن/);
    assert.doesNotMatch(presenceReply.replyText, /لا أملك إجابة/);

    const identity = createSession();
    const identityReply = await identity.send('من معى');
    assert.match(identityReply.replyText, /معك شادن/);
    assert.match(identityReply.replyText, /عيادات أوريان/);
    assert.doesNotMatch(identityReply.replyText, /Oryan Clinic/);
    assert.match(identityReply.replyText, /ممكن أعرف اسمك/);

    const known = createSession({ customerName: 'نورة' });
    assert.match(
      (await known.send('الله يعطيك العافية')).replyText,
      /الله يعافيكِ يا نورة/
    );
    assert.match(
      (await known.send('تسلمي حبيبتي')).replyText,
      /يا نورة|حبيبتي/
    );
    assert.match(
      (await known.send('مع السلامة')).replyText,
      /مع السلامة يا نورة/
    );
    assert.match(
      (await known.send('تمام')).replyText,
      /تمام يا نورة/
    );
  });

  test('does not capture clinic inquiries or invalid replies as names', async () => {
    const session = createSession();
    await session.send('مرحبا');

    const services = await session.send('ما الخدمات');
    assert.match(services.replyText, /إزالة الشعر بالليزر/);
    assert.equal(services.state.data.shaden.customer.name, null);
    assert.equal(services.state.data.shaden.step, 'customer_name');

    for (const invalid of ['نعم', 'لا', 'شكرا', 'اريد حجز موعد', '0500000000']) {
      const result = await session.send(invalid);
      assert.equal(result.state.data.shaden.customer.name, null);
    }

    const captured = await session.send('اسمي آلاء');
    assert.equal(captured.state.data.shaden.customer.name, 'آلاء');
    assert.equal(captured.state.data.shaden.step, null);
  });

  test('keeps database-driven Phase 1 inquiries operational', async () => {
    const session = createSession({ customerName: 'نورة' });
    const branches = (await session.send('هل لديكم فروع')).replyText;
    assert.match(branches, /فرع الصالحية/);
    assert.match(branches, /جدة/);
    assert.match((await session.send('ما الخدمات')).replyText, /إزالة الشعر بالليزر/);
    assert.match((await session.send('ما التخصصات')).replyText, /الجلدية/);
    assert.match((await session.send('ما طرق الدفع')).replyText, /كاش/);
    assert.match((await session.send('ما شركات التأمين')).replyText, /شركة التأمين ألف/);
    assert.match((await session.send('ما الفئات المعتمدة')).replyText, /فئة .*A/u);
    assert.match((await session.send('هل تقبلون class C')).replyText, /غير مقبولة/);
    assert.match((await session.send('هل تعملون الجمعة')).replyText, /مغلق/);

    const dental = await session.send('هل لديكم كشف أسنان');
    assert.match(dental.replyText, /غير مسجلة/);
    assert.doesNotMatch(dental.replyText, /الجلدية|ليزر/);

    const booking = await session.send('اريد حجز موعد');
    assert.match(booking.replyText, /الخدمات المتاحة/);
    assert.equal(booking.state.data.shaden.mode, 'idle');
    assert.equal('serviceId' in booking.state.data.shaden, false);
    assert.equal('bookingSelection' in booking.state.data.shaden, false);
    assert.equal(session.harness.aiCalls, 0);
  });
});

function createSession({ customerName = null } = {}) {
  const initialState = customerName
    ? {
      version: 1,
      mode: 'idle',
      step: null,
      customer: { name: customerName },
      context: null,
      options: [],
    }
    : null;
  const harness = createHarness(initialState);
  return {
    harness,
    persisted() {
      return harness.persisted();
    },
    reload() {
      harness.reload();
    },
    async send(text) {
      const runtime = createShadenEngine(harness.dependencies);
      return runtime.processMessage({
        channel: 'whatsapp',
        waMessageId: `in-${++harness.messageNumber}`,
        senderPhone: '+966500000001',
        receiverPhone: '+966500000002',
        messageType: 'text',
        text,
        rawPayload: {},
      });
    },
  };
}

function createRepositorySession(conversationRepository) {
  let messageNumber = 0;
  const runtime = createShadenEngine({
    patientRepository: {
      findByClinicAndChannelIdentity: async () => null,
    },
    clinicRepository: {
      resolveWhatsAppClinic: async () => ({
        id: 'clinic-1',
        name: 'Oryan Clinic',
        display_name_ar: 'عيادات أوريان',
      }),
    },
    conversationRepository,
    messageRepository: {
      findByExternalId: async () => null,
      saveIncomingMessage: async ({ conversationId }) => ({ conversationId }),
      saveOutgoingMessage: async ({ conversationId }) => ({ conversationId }),
    },
    catalogService: {
      list: async (resource) => resource === 'services'
        ? [active('service-1', 'إزالة الشعر بالليزر')]
        : [],
    },
    clinicConfigurationSource: {
      get: async () => ({ assistantName: 'شادن', assistantGender: 'female' }),
    },
    sendMessage: async () => ({ messageId: `out-${messageNumber}` }),
  });
  return {
    async send(text) {
      const result = await runtime.processMessage({
        channel: 'whatsapp',
        waMessageId: `in-${++messageNumber}`,
        senderPhone: '+966500000001',
        receiverPhone: '+966500000002',
        messageType: 'text',
        text,
        rawPayload: {},
      });
      return { ...result, conversationId: 'conversation-1' };
    },
  };
}

function createConversationDatabase() {
  const database = {
    conversations: [],
    patients: [],
    async query(sql, params) {
      if (sql.includes('FROM "geniusbot"."patients"')) {
        return {
          rows: database.patients
            .filter((patient) =>
              patient.clinic_id === params[0] &&
              patient.identity.replace('+', '') === params[1])
            .map((patient) => ({ id: patient.id })),
        };
      }
      if (sql.includes('FROM "geniusbot"."conversations" AS c')) {
        const [clinicId, channel, identity, patientId] = params;
        const row = database.conversations
          .filter((item) =>
            item.clinic_id === clinicId &&
            item.channel === channel &&
            item.status === 'open' &&
            (
              item.state_payload.channelIdentity === identity ||
              (patientId && item.patient_id === patientId)
            ))
          .sort((left, right) =>
            Number(right.state_payload.channelIdentity === identity) -
            Number(left.state_payload.channelIdentity === identity))[0];
        return { rows: row ? [JSON.parse(JSON.stringify(row))] : [] };
      }
      if (sql.includes('INSERT INTO "geniusbot"."conversations"')) {
        const row = conversationRow({
          id: `conversation-${database.conversations.length + 1}`,
          clinicId: params[0],
          patientId: params[1],
          channel: params[2],
          statePayload: params[6],
        });
        database.conversations.push(row);
        return { rows: [JSON.parse(JSON.stringify(row))] };
      }
      if (sql.includes('SELECT\n        current_state,\n        state_payload')) {
        const row = database.conversations.find((item) => item.id === params[0]);
        return { rows: row ? [JSON.parse(JSON.stringify(row))] : [] };
      }
      if (sql.includes('SET\n        current_state = $2')) {
        const row = database.conversations.find((item) => item.id === params[0]);
        row.current_state = params[1];
        row.state_payload = JSON.parse(params[2]);
        return { rows: [JSON.parse(JSON.stringify(row))] };
      }
      throw new Error(`Unexpected conversation query: ${sql}`);
    },
  };
  return database;
}

function conversationRow({
  id,
  clinicId,
  patientId = null,
  channel = 'whatsapp',
  statePayload,
}) {
  return {
    id,
    clinic_id: clinicId,
    patient_id: patientId,
    channel,
    status: 'open',
    assigned_to_staff_id: null,
    bot_enabled: true,
    current_state: null,
    state_payload: JSON.parse(JSON.stringify(statePayload)),
    handover_at: null,
    handover_reason: null,
    started_at: '2026-07-28T00:00:00.000Z',
    ended_at: null,
  };
}

function createHarness(initialShadenState) {
  let storedState = {
    current: initialShadenState ? 'shaden' : null,
    data: {
      unrelated: { preserved: true },
      ...(initialShadenState ? { shaden: reload(initialShadenState) } : {}),
    },
  };
  const conversation = {
    id: 'conversation-1',
    botEnabled: true,
  };
  const resources = {
    branches: [
      { ...active('branch-1', 'فرع العليا'), city: 'Riyadh' },
      { ...active('branch-2', 'فرع الصالحية'), city: 'Jeddah' },
    ],
    specialties: [active('specialty-1', 'الجلدية')],
    services: [
      active('service-1', 'إزالة الشعر بالليزر'),
      active('service-2', 'تنظيف البشرة'),
    ],
    'payment-methods': [
      { ...active('payment-1', 'Cash'), code: 'cash' },
      { ...active('payment-2', 'Insurance'), code: 'insurance' },
    ],
    'insurance-companies': [
      active('company-1', 'شركة التأمين ألف'),
    ],
    'insurance-classes': [
      insuranceClass('class-a', 'فئة A', true),
      insuranceClass('class-c', 'فئة C', false),
    ],
    'branch-working-hours': [
      hours('branch-1', 5, null, null, true),
      hours('branch-1', 6, '10:00:00', '14:00:00', false),
    ],
  };
  return {
    messageNumber: 0,
    aiCalls: 0,
    persisted: () => reload(storedState),
    reload: () => {
      storedState = JSON.parse(JSON.stringify(storedState));
    },
    dependencies: {
      patientRepository: {
        findByClinicAndChannelIdentity: async () => null,
      },
      clinicRepository: {
        resolveWhatsAppClinic: async () => ({
          id: 'clinic-1',
          name: 'Oryan Clinic',
          display_name_ar: 'عيادات أوريان',
        }),
      },
      conversationRepository: {
        findActiveByChannelIdentity: async () => reload(conversation),
        create: async () => reload(conversation),
        loadState: async () => reload(storedState),
        updateState: async (id, state) => {
          storedState = reload(state);
          return reload(storedState);
        },
      },
      messageRepository: {
        findByExternalId: async () => null,
        saveIncomingMessage: async () => ({}),
        saveOutgoingMessage: async () => ({}),
      },
      catalogService: {
        list: async (resource) => reload(resources[resource] || []),
      },
      clinicConfigurationSource: {
        get: async () => ({ assistantName: 'شادن', assistantGender: 'female' }),
      },
      sendMessage: async () => ({ messageId: 'out-1' }),
    },
  };
}

function assertSingleNameField(state) {
  assert.equal(state.customer.name, 'نورة');
  for (const forbidden of ['sessionName', 'capturedName', 'pendingName']) {
    assert.equal(forbidden in state, false);
  }
}

function active(id, name) {
  return { id, name, is_active: true };
}

function insuranceClass(id, className, accepted) {
  return {
    id,
    insurance_company_id: 'company-1',
    class_name: className,
    is_accepted: accepted,
  };
}

function hours(branchId, day, opensAt, closesAt, isClosed) {
  return {
    branch_id: branchId,
    day_of_week: day,
    opens_at: opensAt,
    closes_at: closesAt,
    is_closed: isClosed,
  };
}

function reload(value) {
  return JSON.parse(JSON.stringify(value));
}
