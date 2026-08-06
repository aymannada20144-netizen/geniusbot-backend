'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const sendWhatsAppMessage = require(
  '../../src/channels/whatsapp/sendWhatsAppMessage'
);

function runtime(post) {
  const logs = [];
  return {
    logs,
    options: {
      httpClient: { post },
      logger: {
        error(message, details) {
          logs.push({ message, details });
        },
      },
    },
  };
}

function confirmationInteraction(overrides = {}) {
  return {
    version: 1,
    mode: 'reply_buttons',
    purpose: 'any-semantic-purpose',
    displayText: '💳 اختاري طريقة الدفع.',
    options: [
      { id: 'payment:cash', label: 'كاش' },
      { id: 'payment:insurance', label: 'تأمين' },
    ],
    ...overrides,
  };
}

function listInteraction(overrides = {}) {
  return {
    version: 1,
    mode: 'list',
    purpose: 'view_items',
    displayText: '✨ اختاري الخدمة المناسبة من القائمة.',
    listPrompt: 'عرض الخدمات',
    options: [{ id: 'service:1', label: 'تنظيف البشرة' }],
    ...overrides,
  };
}

function successfulTransport(assertPayload = () => {}) {
  let calls = 0;
  const transport = runtime(async (_url, payload) => {
    calls += 1;
    assertPayload(payload);
    return { status: 200, data: { messages: [{ id: 'wamid.ok' }] } };
  });
  return { transport, calls: () => calls };
}

describe('WhatsApp outbound transport', () => {
  test('returns the Meta message id for a successful send', async () => {
    const transport = runtime(async (_url, body, config) => {
      assert.equal(body.messaging_product, 'whatsapp');
      assert.equal(body.to, '966500000001');
      assert.equal(body.text.body, 'مرحبًا');
      assert.match(config.headers.Authorization, /^Bearer /);
      return {
        status: 200,
        data: { messages: [{ id: 'wamid.success' }] },
      };
    });

    assert.deepEqual(
      await sendWhatsAppMessage(
        { to: '966500000001', body: 'مرحبًا' },
        transport.options
      ),
      { messageId: 'wamid.success' }
    );
    assert.equal(transport.logs.length, 0);
  });

  test('preserves the template contract', async () => {
    const { transport } = successfulTransport((payload) => {
      assert.equal(payload.type, 'template');
      assert.equal(payload.template.name, 'appointment_confirmation');
      assert.equal(payload.template.language.code, 'ar');
    });
    await sendWhatsAppMessage({
      to: '966500000001',
      templateName: 'appointment_confirmation',
      language: 'ar',
    }, transport.options);
  });

  test('preserves the sendText helper', async () => {
    const original = sendWhatsAppMessage;
    const previousPost = require('axios').post;
    require('axios').post = async (_url, payload) => {
      assert.equal(payload.type, 'text');
      assert.equal(payload.text.body, 'نص المساعد');
      return { status: 200, data: { messages: [{ id: 'wamid.helper' }] } };
    };
    try {
      assert.deepEqual(await original.sendText({
        recipientId: '966500000001',
        body: 'نص المساعد',
      }), { messageId: 'wamid.helper' });
    } finally {
      require('axios').post = previousPost;
    }
  });

  test('template takes priority over body and interaction', async () => {
    const { transport } = successfulTransport((payload) => {
      assert.equal(payload.type, 'template');
      assert.equal('interactive' in payload, false);
      assert.equal('text' in payload, false);
    });
    await sendWhatsAppMessage({
      to: '966500000001',
      body: 'fallback',
      interaction: confirmationInteraction(),
      templateName: 'appointment_confirmation',
      language: 'ar',
    }, transport.options);
  });

  test('builds reply buttons with explicit body without changing ids or labels', async () => {
    const interaction = confirmationInteraction();
    const { transport } = successfulTransport((payload) => {
      assert.equal(payload.type, 'interactive');
      assert.equal(payload.interactive.type, 'button');
      assert.equal(payload.interactive.body.text, 'النص الكامل');
      assert.deepEqual(payload.interactive.action.buttons, [
        { type: 'reply', reply: { id: 'payment:cash', title: 'كاش' } },
        { type: 'reply', reply: { id: 'payment:insurance', title: 'تأمين' } },
      ]);
    });
    assert.deepEqual(await sendWhatsAppMessage({
      to: '966500000001', body: 'النص الكامل', interaction,
    }, transport.options), { messageId: 'wamid.ok' });
  });

  test('reply buttons without a valid explicit body use displayText', async () => {
    for (const input of [{}, { body: '' }, { body: 42 }]) {
      const interaction = confirmationInteraction();
      const { transport } = successfulTransport((payload) => {
        assert.equal(payload.interactive.body.text, interaction.displayText);
      });
      await sendWhatsAppMessage({
        to: '966500000001',
        ...input,
        interaction,
      }, transport.options);
    }
  });

  test('availability recovery explanation reaches the final reply-buttons payload', async () => {
    const explanation =
      'غدًا الجمعة والعيادة مغلقة. هذه أقرب المواعيد المتاحة بعد ذلك:';
    const interaction = confirmationInteraction({
      purpose: 'select_booking_alternative',
      displayText: 'اختاري موعدًا بديلًا:',
      options: [{
        id: 'booking-alternative:2026-08-08T09:00',
        label: '08/08 09:00 ص',
      }],
    });
    const { transport } = successfulTransport((payload) => {
      assert.equal(payload.interactive.body.text, explanation);
      assert.notEqual(payload.interactive.body.text, interaction.displayText);
      assert.equal(
        payload.interactive.action.buttons[0].reply.id,
        interaction.options[0].id
      );
    });

    await sendWhatsAppMessage({
      to: '966500000001',
      body: explanation,
      interaction,
    }, transport.options);
  });

  test('booking confirmation keeps the full review body and stable button IDs', async () => {
    const review = '📋 *راجعي تفاصيل حجزك*\n\n💎 *الخدمة*\nفيلر\n\nهل البيانات صحيحة؟ 🌸';
    const interaction = confirmationInteraction({
      purpose: 'confirm_booking',
      displayText: 'راجعي تفاصيل الحجز ثم اختاري:',
      options: [
        { id: 'booking-confirm:yes', label: 'تأكيد الحجز' },
        { id: 'booking-confirm:cancel', label: 'إلغاء' },
      ],
    });
    const { transport } = successfulTransport((payload) => {
      assert.equal(payload.interactive.body.text, review);
      assert.notEqual(payload.interactive.body.text, interaction.displayText);
      assert.deepEqual(payload.interactive.action.buttons, [
        { type: 'reply', reply: { id: 'booking-confirm:yes', title: 'تأكيد الحجز' } },
        { type: 'reply', reply: { id: 'booking-confirm:cancel', title: 'إلغاء' } },
      ]);
    });

    await sendWhatsAppMessage({
      to: '966500000001',
      body: review,
      interaction,
    }, transport.options);
  });

  test('builds one list section and preserves optional descriptions', async () => {
    const interaction = listInteraction({ options: [
      { id: 'service:1', label: 'تنظيف البشرة' },
      { id: 'service:2', label: 'ليزر', description: 'مدة الجلسة 30 دقيقة' },
    ] });
    const { transport } = successfulTransport((payload) => {
      assert.equal(payload.interactive.type, 'list');
      assert.equal(payload.interactive.body.text, interaction.displayText);
      assert.equal(payload.interactive.action.sections.length, 1);
      assert.deepEqual(payload.interactive.action.sections[0].rows, [
        { id: 'service:1', title: 'تنظيف البشرة' },
        { id: 'service:2', title: 'ليزر', description: 'مدة الجلسة 30 دقيقة' },
      ]);
    });
    await sendWhatsAppMessage({
      to: '966500000001', body: 'fallback', interaction,
    }, transport.options);
  });

  test('accepts Meta limits for ten rows and three buttons', async () => {
    for (const interaction of [
      listInteraction({ options: Array.from({ length: 10 }, (_, index) => ({
        id: `row:${index}`, label: `خدمة ${index}`,
      })) }),
      confirmationInteraction({ options: Array.from({ length: 3 }, (_, index) => ({
        id: `button:${index}`, label: `خيار ${index}`,
      })) }),
    ]) {
      const { transport } = successfulTransport((payload) => {
        assert.equal(payload.type, 'interactive');
      });
      await sendWhatsAppMessage({
        to: '966500000001', body: 'fallback', interaction,
      }, transport.options);
    }
  });

  test('invalid interactions fall back to unchanged text with one Meta call', async () => {
    const invalidInteractions = [
      null,
      confirmationInteraction({ version: 2 }),
      confirmationInteraction({ mode: 'unsupported' }),
      confirmationInteraction({ purpose: ' ' }),
      confirmationInteraction({ displayText: 'x'.repeat(1025) }),
      confirmationInteraction({ options: [] }),
      confirmationInteraction({ options: [
        { id: 'same', label: 'أول' }, { id: 'same', label: 'ثان' },
      ] }),
      confirmationInteraction({ options: [{ id: 'x', label: '' }] }),
      confirmationInteraction({ options: Array.from({ length: 4 }, (_, index) => ({
        id: `button:${index}`, label: `خيار ${index}`,
      })) }),
      confirmationInteraction({ options: [{ id: 'x', label: 'x'.repeat(21) }] }),
      confirmationInteraction({ options: [{ id: 'x', label: 'نعم', description: 'غير مسموح' }] }),
      confirmationInteraction({ listPrompt: 'غير مسموح' }),
      listInteraction({ options: Array.from({ length: 11 }, (_, index) => ({
        id: `row:${index}`, label: `خدمة ${index}`,
      })) }),
      listInteraction({ listPrompt: 'x'.repeat(21) }),
      listInteraction({ options: [{ id: 'x', label: 'x'.repeat(25) }] }),
      listInteraction({ options: [{ id: 'x', label: 'خدمة', description: 'x'.repeat(73) }] }),
      listInteraction({ listPrompt: undefined }),
    ];

    for (const interaction of invalidInteractions) {
      const { transport, calls } = successfulTransport((payload) => {
        assert.equal(payload.type, 'text');
        assert.equal(payload.text.body, 'النص الاحتياطي الكامل');
      });
      await sendWhatsAppMessage({
        to: '966500000001',
        body: 'النص الاحتياطي الكامل',
        interaction,
      }, transport.options);
      assert.equal(calls(), 1);
    }
  });

  test('does not send a fallback after interactive timeout or HTTP failure', async () => {
    for (const failure of ['timeout', 'http']) {
      let calls = 0;
      const transport = runtime(async (_url, payload) => {
        calls += 1;
        assert.equal(payload.type, 'interactive');
        if (failure === 'timeout') {
          const error = new Error('timeout');
          error.code = 'ECONNABORTED';
          throw error;
        }
        return { status: 500, data: { error: { message: 'Meta failed' } } };
      });
      await assert.rejects(sendWhatsAppMessage({
        to: '966500000001',
        body: 'fallback',
        interaction: confirmationInteraction(),
      }, transport.options));
      assert.equal(calls, 1);
    }
  });

  test('preserves and safely logs the complete JSON Meta error', async () => {
    const responseBody = {
      error: {
        message: 'Recipient phone number not in allowed list',
        type: 'OAuthException',
        code: 131030,
        error_subcode: 2494010,
        fbtrace_id: 'trace-1',
        access_token: 'must-not-leak',
        error_data: { details: 'Add the recipient first.' },
      },
    };
    const transport = runtime(async () => ({
      status: 400,
      data: responseBody,
    }));

    await assert.rejects(
      sendWhatsAppMessage(
        { to: '966500000001', body: 'اختبار' },
        transport.options
      ),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.metaCode, 131030);
        assert.equal(error.metaErrorSubcode, 2494010);
        assert.equal(error.metaMessage, responseBody.error.message);
        assert.equal(error.metaType, 'OAuthException');
        assert.equal(error.fbtraceId, 'trace-1');
        assert.equal(
          error.responseBody.error.access_token,
          '[REDACTED]'
        );
        return true;
      }
    );
    const serialized = JSON.stringify(transport.logs);
    assert.doesNotMatch(serialized, /must-not-leak/);
    assert.doesNotMatch(serialized, /Bearer /);
    assert.match(serialized, /131030/);
    assert.match(serialized, /trace-1/);
  });

  test('records a non-JSON Meta response body', async () => {
    const transport = runtime(async () => ({
      status: 502,
      data: '<html>Bad Gateway</html>',
    }));
    await assert.rejects(
      sendWhatsAppMessage(
        { to: '966500000001', body: 'اختبار' },
        transport.options
      ),
      (error) => {
        assert.equal(error.status, 502);
        assert.equal(error.responseBody, '<html>Bad Gateway</html>');
        assert.equal(error.retryable, true);
        return true;
      }
    );
  });

  test('classifies a network error without exposing request configuration', async () => {
    const transport = runtime(async () => {
      const error = new Error('socket closed');
      error.code = 'ECONNRESET';
      error.config = {
        headers: { Authorization: 'Bearer must-not-leak' },
      };
      throw error;
    });
    await assert.rejects(
      sendWhatsAppMessage(
        { to: '966500000001', body: 'اختبار' },
        transport.options
      ),
      (error) => {
        assert.equal(error.networkCode, 'ECONNRESET');
        assert.equal(error.retryable, true);
        assert.equal(error.timeout, false);
        return true;
      }
    );
    assert.doesNotMatch(JSON.stringify(transport.logs), /must-not-leak/);
  });

  test('classifies an Axios timeout as retryable', async () => {
    const transport = runtime(async () => {
      const error = new Error('timeout');
      error.code = 'ECONNABORTED';
      throw error;
    });
    await assert.rejects(
      sendWhatsAppMessage(
        { to: '966500000001', body: 'اختبار' },
        transport.options
      ),
      (error) => {
        assert.equal(error.networkCode, 'ECONNABORTED');
        assert.equal(error.timeout, true);
        assert.equal(error.retryable, true);
        return true;
      }
    );
  });

  test('extracts a JSON Meta 401 body, classifies it, and never retries', async () => {
    const transport = runtime(async () => ({
      status: 401,
      data: JSON.stringify({
        error: {
          message: 'Error validating access token: Session has expired',
          type: 'OAuthException',
          code: 190,
          error_subcode: 463,
          fbtrace_id: 'trace-expired',
        },
      }),
    }));
    await assert.rejects(
      sendWhatsAppMessage(
        { to: '966500000001', body: 'اختبار' },
        transport.options
      ),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.metaCode, 190);
        assert.equal(error.metaErrorSubcode, 463);
        assert.equal(error.metaCause, 'expired_token');
        assert.equal(error.retryable, false);
        assert.match(error.message, /HTTP 401/);
        assert.match(error.message, /Session has expired/);
        return true;
      }
    );
  });

  test('exposes only safe token diagnostics', () => {
    const diagnostics = sendWhatsAppMessage.getSafeRuntimeDiagnostics({
      recipient: '966500000001',
    });
    assert.equal(diagnostics.graphApiVersion, 'v25.0');
    assert.equal(diagnostics.tokenPresent, true);
    assert.equal(diagnostics.authorizationHeaderPresent, true);
    assert.match(diagnostics.tokenFingerprint, /^[a-f0-9]{12}$/);
    assert.equal('token' in diagnostics, false);
    assert.doesNotMatch(
      JSON.stringify(diagnostics),
      /Bearer\s|EAAV/
    );
  });
});
