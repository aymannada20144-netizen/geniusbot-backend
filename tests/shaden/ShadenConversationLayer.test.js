'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const GroqConversationProvider = require('../../src/services/shaden/conversation/GroqConversationProvider');
const ShadenConversationLayer = require('../../src/services/shaden/conversation/ShadenConversationLayer');
const ShadenReadOnlyTools = require('../../src/services/shaden/conversation/ShadenReadOnlyTools');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');

const clinicData = {
  clinic: { id: 'clinic-internal', name: 'عيادات الاختبار' },
  assistantIdentity: { name: 'شادن', gender: 'female' },
  specialties: [{ id: 'specialty-1', name: 'الجلدية', description: 'عناية بالبشرة' }],
  services: [{
    id: 'service-1', name: 'الليزر', description: 'إزالة الشعر',
    specialtyId: 'specialty-1', specialtyName: 'الجلدية',
  }],
  branches: [{
    id: 'branch-1', name: 'فرع الصالحية', city: 'جدة',
    address: 'الشارع العام', googleMapsUrl: 'https://maps.example/branch',
  }],
  serviceBranchAssignments: [{ serviceId: 'service-1', branchId: 'branch-1' }],
  paymentMethods: [{ id: 'payment-1', name: 'كاش' }],
  insuranceCompanies: [{ id: 'company-1', name: 'شركة ألف' }],
  insuranceClasses: [{
    id: 'class-1', insuranceCompanyId: 'company-1', name: 'A', isAccepted: true,
  }],
  workingHours: [{
    branchId: 'branch-1', dayOfWeek: 0, opensAt: '09:00', closesAt: '17:00', isClosed: false,
  }],
};

test('provider uses normal chat completion with automatic tools and no response schema', async () => {
  const requests = [];
  const provider = new GroqConversationProvider({ client: {
    chat: { completions: { async create(request) {
      requests.push(request);
      return { model: 'test-model', choices: [{ message: { role: 'assistant', content: 'أهلًا 🌸' } }] };
    } } },
  } });
  const result = await provider.complete([{ role: 'user', content: 'هلا' }], []);
  assert.equal(result.content, 'أهلًا 🌸');
  assert.deepEqual(result.toolCalls, []);
  assert.equal(requests[0].tool_choice, 'auto');
  assert.equal('response_format' in requests[0], false);
  assert.equal('responseFormat' in requests[0], false);
});

test('read-only catalog tool returns authoritative relationships without internal IDs', async () => {
  const tools = new ShadenReadOnlyTools({ clinicData });
  const result = await tools.execute('get_clinic_catalog');
  assert.equal(result.status, 'EVIDENCE');
  assert.deepEqual(result.value.services[0].availableAt, ['فرع الصالحية']);
  assert.equal(JSON.stringify(result).includes('service-1'), false);
  assert.equal(JSON.stringify(result).includes('branch-1'), false);
});

test('read-only business tool exposes normalized clinic facts', async () => {
  const result = await new ShadenReadOnlyTools({ clinicData })
    .execute('get_clinic_business_details');
  assert.equal(result.status, 'EVIDENCE');
  assert.deepEqual(result.value.paymentMethods, ['كاش']);
  assert.deepEqual(result.value.acceptedInsuranceClasses, [
    { company: 'شركة ألف', name: 'A' },
  ]);
});

test('natural conversation returns direct model content when no facts are requested', async () => {
  const received = [];
  const layer = new ShadenConversationLayer({ provider: {
    async complete(messages, tools) {
      received.push({ messages, tools });
      return {
        content: 'يا هلا فيك 🌸', toolCalls: [],
        assistantMessage: { role: 'assistant', content: 'يا هلا فيك 🌸' }, model: 'test',
      };
    },
  } });
  const result = await layer.respond({
    currentMessage: 'تحية حرة',
    contextTurns: [{ role: 'user', content: 'سياق سابق' }],
    clinicData,
  });
  assert.equal(result.reply, 'يا هلا فيك 🌸');
  assert.equal(received[0].messages.at(-2).content, 'سياق سابق');
  assert.equal(received[0].tools.length, 2);
  assert.match(received[0].messages[0].content, /أي سؤال أو ادعاء عن العيادة يوجب استدعاء الأداة/);
});

test('tool request executes authoritative tool then model writes final natural answer', async () => {
  let calls = 0;
  let finalMessages;
  const layer = new ShadenConversationLayer({ provider: {
    async complete(messages) {
      calls += 1;
      if (calls === 1) return {
        content: null,
        toolCalls: [{
          id: 'call-1', type: 'function',
          function: { name: 'get_clinic_catalog', arguments: '{}' },
        }],
        assistantMessage: {
          role: 'assistant', content: null,
          tool_calls: [{
            id: 'call-1', type: 'function',
            function: { name: 'get_clinic_catalog', arguments: '{}' },
          }],
        }, model: 'test',
      };
      finalMessages = messages;
      return {
        content: 'الليزر متوفر في فرع الصالحية 🌸', toolCalls: [],
        assistantMessage: { role: 'assistant', content: 'الليزر متوفر في فرع الصالحية 🌸' },
        model: 'test',
      };
    },
  } });
  const result = await layer.respond({ currentMessage: 'سؤال حر عن توفر خدمة', clinicData });
  assert.equal(result.reply, 'الليزر متوفر في فرع الصالحية 🌸');
  assert.equal(result.toolCallCount, 1);
  const toolMessage = finalMessages.find((item) => item.role === 'tool');
  assert.match(toolMessage.content, /فرع الصالحية/);
  assert.equal(finalMessages.at(-1).role, 'system');
  assert.match(finalMessages.at(-1).content, /بالاعتماد الحصري/);
});

test('unknown tool and provider failure use safe fallbacks', async () => {
  const unknown = new ShadenConversationLayer({ provider: {
    async complete() { return {
      content: null,
      toolCalls: [{ id: 'x', function: { name: 'write_database', arguments: '{}' } }],
      assistantMessage: { role: 'assistant', content: null, tool_calls: [] }, model: 'test',
    }; },
  } });
  const failed = new ShadenConversationLayer({
    provider: { async complete() { throw Object.assign(new Error('failed'), { status: 400 }); } },
    logger: { warn() {} },
  });
  assert.equal((await unknown.respond({ currentMessage: 'x', clinicData })).reply,
    ShadenConversationLayer.FACT_FALLBACK);
  assert.equal((await failed.respond({ currentMessage: 'x', clinicData })).reply,
    ShadenConversationLayer.TECHNICAL_FALLBACK);
});

test('final response sanitizes internal UUIDs', async () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const layer = new ShadenConversationLayer({ provider: { async complete() { return {
    content: `الخدمة متاحة ${uuid}`, toolCalls: [],
    assistantMessage: { role: 'assistant', content: null }, model: 'test',
  }; } } });
  const result = await layer.respond({ currentMessage: 'x', clinicData });
  assert.equal(result.reply.includes(uuid), false);
});

test('operational, structured catalogue, and social identity intents retain deterministic ownership', () => {
  const owns = createShadenEngine.shouldUseOperationalCore;
  assert.equal(owns({}, { version: 1 }, { type: 'booking' }), 'EXPLICIT_OPERATIONAL_REQUEST');
  assert.equal(owns({}, { version: 1, cancellation: { step: 'confirmation' } }, { type: 'unknown' }),
    'ACTIVE_OPERATIONAL_STATE');
  assert.equal(owns({ inputProvenance: { trusted: true } }, { version: 1 }, { type: 'unknown' }),
    'TRUSTED_MACHINE_INPUT');
  assert.equal(owns({}, { version: 1 }, { type: 'services' }), null);
  assert.equal(createShadenEngine.isStructuredReadOnlyInquiry({ type: 'services' }), 'STRUCTURED_READ_ONLY_FORMATTER');
  assert.equal(createShadenEngine.isStructuredReadOnlyInquiry({ type: 'services_under_specialty' }), 'STRUCTURED_READ_ONLY_FORMATTER');
  assert.equal(createShadenEngine.isStructuredReadOnlyInquiry({ type: 'branches' }), 'STRUCTURED_READ_ONLY_FORMATTER');
  assert.equal(createShadenEngine.isStructuredReadOnlyInquiry({ type: 'specialties' }), 'STRUCTURED_READ_ONLY_FORMATTER');
  assert.equal(createShadenEngine.isStructuredReadOnlyInquiry({ type: 'working_hours' }), 'STRUCTURED_READ_ONLY_FORMATTER');
  assert.equal(createShadenEngine.isStructuredReadOnlyInquiry({ type: 'identity' }), 'STRUCTURED_READ_ONLY_FORMATTER');
  assert.equal(createShadenEngine.isStructuredReadOnlyInquiry({ type: 'greeting' }), 'STRUCTURED_READ_ONLY_FORMATTER');
});

test('social prompt keeps warmth while grounding identity and personal context', () => {
  const prompt = ShadenConversationLayer.systemPrompt(clinicData);
  assert.match(prompt, /مجرد ذكر اسمك.*ليس سؤال هوية/u);
  assert.match(prompt, /لا تخترعي حقائق شخصية أو أحداثًا مستقبلية/u);
  assert.match(prompt, /لا تملكين مظهرًا بشريًا حقيقيًا/u);
  assert.match(prompt, /الدفء الطبيعي والأسلوب الودود الحالي/u);
});

test('current user turn is last and a duplicated persisted current turn is removed', async () => {
  let received;
  const layer = new ShadenConversationLayer({
    provider: { async complete(messages) {
      received = messages;
      return {
        content: 'إجابة السؤال الجديد', toolCalls: [],
        assistantMessage: { role: 'assistant', content: 'إجابة السؤال الجديد' }, model: 'test',
      };
    } },
    logger: { info() {} },
  });
  await layer.respond({
    currentMessage: 'سؤال حالي مختلف',
    contextTurns: [
      { role: 'user', content: 'سؤال سابق' },
      { role: 'assistant', content: 'جواب سابق' },
      { role: 'user', content: 'سؤال حالي مختلف' },
    ],
    clinicData,
  });
  assert.equal(received.at(-1).role, 'user');
  assert.equal(received.at(-1).content, 'سؤال حالي مختلف');
  assert.equal(received.filter((item) =>
    item.role === 'user' && item.content === 'سؤال حالي مختلف'
  ).length, 1);
});

test('tool observability records current message, selected tool, safe arguments, and status', async () => {
  const logs = [];
  let calls = 0;
  const layer = new ShadenConversationLayer({
    logger: { info(entry) { logs.push(entry); } },
    provider: { async complete() {
      calls += 1;
      return calls === 1 ? {
        content: null,
        toolCalls: [{
          id: 'call-observe',
          function: {
            name: 'get_clinic_catalog',
            arguments: '{"entity_id":"11111111-1111-4111-8111-111111111111"}',
          },
        }],
        assistantMessage: {
          role: 'assistant', content: null,
          tool_calls: [{
            id: 'call-observe',
            function: { name: 'get_clinic_catalog', arguments: '{}' },
          }],
        }, model: 'test',
      } : {
        content: 'نتيجة موثقة', toolCalls: [],
        assistantMessage: { role: 'assistant', content: 'نتيجة موثقة' }, model: 'test',
      };
    } },
  });
  await layer.respond({ currentMessage: 'سؤال عيادة حالي', clinicData });
  const trace = logs.find((entry) => entry.event === 'SHADEN_READ_ONLY_TOOL_CALL');
  assert.equal(trace.currentUserMessage, 'سؤال عيادة حالي');
  assert.equal(trace.toolSelected, 'get_clinic_catalog');
  assert.deepEqual(trace.toolArguments, {});
  assert.equal(trace.toolResultStatus, 'EVIDENCE');
  assert.equal(JSON.stringify(trace).includes('11111111-1111-4111-8111-111111111111'), false);
});
