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