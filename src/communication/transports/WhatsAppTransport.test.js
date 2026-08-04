'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const WhatsAppTransport = require('./WhatsAppTransport');

const TOKEN = 'test-whatsapp-token';
const PHONE_NUMBER_ID = '123456789';
const API_VERSION = 'v23.0';

function createMessage(overrides = {}) {
    return {
        type: 'appointment_confirmation',
        channel: 'whatsapp',

        recipient: {
            phone: '966500000000'
        },

        template: {
            name: 'appointment_confirmation',
            language: 'ar',
            components: [
                {
                    type: 'body',
                    parameters: [
                        {
                            type: 'text',
                            text: 'أحمد'
                        }
                    ]
                }
            ]
        },

        ...overrides
    };
}

function createResponse({
    ok = true,
    status = 200,
    body = {}
} = {}) {
    return {
        ok,
        status,

        async text() {
            return body === null
                ? ''
                : JSON.stringify(body);
        }
    };
}

test(
    'constructor rejects a missing token',
    () => {
        assert.throws(
            () => new WhatsAppTransport({
                token: '',
                phoneNumberId: PHONE_NUMBER_ID,
                fetchImpl: async () => {}
            }),
            {
                name: 'TypeError',
                message: 'WhatsAppTransport token is required.'
            }
        );
    }
);

test(
    'constructor rejects a missing phoneNumberId',
    () => {
        assert.throws(
            () => new WhatsAppTransport({
                token: TOKEN,
                phoneNumberId: '',
                fetchImpl: async () => {}
            }),
            {
                name: 'TypeError',
                message: 'WhatsAppTransport phoneNumberId is required.'
            }
        );
    }
);

test(
    'constructor rejects an invalid timeout',
    () => {
        assert.throws(
            () => new WhatsAppTransport({
                token: TOKEN,
                phoneNumberId: PHONE_NUMBER_ID,
                timeoutMs: 0,
                fetchImpl: async () => {}
            }),
            {
                name: 'TypeError',
                message:
                    'WhatsAppTransport timeoutMs must be a positive number.'
            }
        );
    }
);

test(
    'constructor rejects a missing fetch implementation',
    () => {
        assert.throws(
            () => new WhatsAppTransport({
                token: TOKEN,
                phoneNumberId: PHONE_NUMBER_ID,
                fetchImpl: null
            }),
            {
                name: 'TypeError',
                message:
                    'WhatsAppTransport requires a fetch implementation.'
            }
        );
    }
);

test(
    'send rejects a message for a non-whatsapp channel',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            fetchImpl: async () => {
                throw new Error('Fetch must not be called.');
            }
        });

        await assert.rejects(
            () => transport.send(
                createMessage({
                    channel: 'email'
                })
            ),
            {
                name: 'TypeError',
                message:
                    'WhatsAppTransport only supports the whatsapp channel.'
            }
        );
    }
);

test(
    'send rejects a message without recipient phone',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            fetchImpl: async () => {
                throw new Error('Fetch must not be called.');
            }
        });

        await assert.rejects(
            () => transport.send(
                createMessage({
                    recipient: {
                        phone: ''
                    }
                })
            ),
            {
                name: 'TypeError',
                message:
                    'WhatsAppTransport message.recipient.phone is required.'
            }
        );
    }
);

test(
    'send rejects a message without template name',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            fetchImpl: async () => {
                throw new Error('Fetch must not be called.');
            }
        });

        const message = createMessage();

        message.template.name = '';

        await assert.rejects(
            () => transport.send(message),
            {
                name: 'TypeError',
                message:
                    'WhatsAppTransport message.template.name is required.'
            }
        );
    }
);

test(
    'send rejects a message without template language',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            fetchImpl: async () => {
                throw new Error('Fetch must not be called.');
            }
        });

        const message = createMessage();

        message.template.language = '';

        await assert.rejects(
            () => transport.send(message),
            {
                name: 'TypeError',
                message:
                    'WhatsAppTransport message.template.language is required.'
            }
        );
    }
);

test(
    'send posts the correct Meta template payload',
    async () => {
        let capturedUrl = null;
        let capturedOptions = null;

        const fetchImpl = async (url, options) => {
            capturedUrl = url;
            capturedOptions = options;

            return createResponse({
                status: 200,
                body: {
                    messaging_product: 'whatsapp',
                    contacts: [
                        {
                            input: '966500000000',
                            wa_id: '966500000000'
                        }
                    ],
                    messages: [
                        {
                            id: 'wamid.test-message-id'
                        }
                    ]
                }
            });
        };

        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            apiVersion: API_VERSION,
            fetchImpl
        });

        const message = createMessage();
        const result = await transport.send(message);

        assert.equal(
            capturedUrl,
            `https://graph.facebook.com/${API_VERSION}/` +
                `${PHONE_NUMBER_ID}/messages`
        );

        assert.equal(
            capturedOptions.method,
            'POST'
        );

        assert.equal(
            capturedOptions.headers.Authorization,
            `Bearer ${TOKEN}`
        );

        assert.equal(
            capturedOptions.headers['Content-Type'],
            'application/json'
        );

        assert.ok(
            capturedOptions.signal instanceof AbortSignal
        );

        assert.deepEqual(
            JSON.parse(capturedOptions.body),
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: '966500000000',
                type: 'template',

                template: {
                    name: 'appointment_confirmation',

                    language: {
                        code: 'ar'
                    },

                    components: [
                        {
                            type: 'body',
                            parameters: [
                                {
                                    type: 'text',
                                    text: 'أحمد'
                                }
                            ]
                        }
                    ]
                }
            }
        );

        assert.deepEqual(
            result,
            {
                provider: 'meta',
                channel: 'whatsapp',
                statusCode: 200,
                messageId: 'wamid.test-message-id',
                recipient: '966500000000',

                response: {
                    messaging_product: 'whatsapp',

                    contacts: [
                        {
                            input: '966500000000',
                            wa_id: '966500000000'
                        }
                    ],

                    messages: [
                        {
                            id: 'wamid.test-message-id'
                        }
                    ]
                }
            }
        );

        assert.equal(
            Object.isFrozen(result),
            true
        );
    }
);

test(
    'send omits empty template components',
    async () => {
        let capturedPayload = null;

        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,

            fetchImpl: async (url, options) => {
                capturedPayload = JSON.parse(options.body);

                return createResponse({
                    status: 200,
                    body: {
                        messages: [
                            {
                                id: 'wamid.no-components'
                            }
                        ]
                    }
                });
            }
        });

        const message = createMessage();

        message.template.components = [];

        await transport.send(message);

        assert.deepEqual(
            capturedPayload.template,
            {
                name: 'appointment_confirmation',

                language: {
                    code: 'ar'
                }
            }
        );

        assert.equal(
            Object.hasOwn(
                capturedPayload.template,
                'components'
            ),
            false
        );
    }
);

test(
    'send returns null messageId when Meta does not return one',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,

            fetchImpl: async () => createResponse({
                status: 200,
                body: {
                    messaging_product: 'whatsapp'
                }
            })
        });

        const result = await transport.send(
            createMessage()
        );

        assert.equal(
            result.messageId,
            null
        );
    }
);

test(
    'send creates a non-retryable error for HTTP 400',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,

            fetchImpl: async () => createResponse({
                ok: false,
                status: 400,

                body: {
                    error: {
                        message: 'Invalid template parameter.',
                        type: 'OAuthException',
                        code: 100,
                        error_subcode: 2388001,
                        fbtrace_id: 'TRACE_ID'
                    }
                }
            })
        });

        await assert.rejects(
            () => transport.send(
                createMessage()
            ),
            (error) => {
                assert.equal(
                    error.name,
                    'WhatsAppTransportApiError'
                );

                assert.equal(
                    error.code,
                    'META_100'
                );

                assert.equal(
                    error.message,
                    'Invalid template parameter.'
                );

                assert.equal(
                    error.retryable,
                    false
                );

                assert.equal(
                    error.isTransportError,
                    true
                );

                assert.equal(
                    error.statusCode,
                    400
                );

                assert.equal(
                    error.metaErrorCode,
                    100
                );

                assert.equal(
                    error.metaErrorSubcode,
                    2388001
                );

                assert.equal(
                    error.metaTraceId,
                    'TRACE_ID'
                );

                return true;
            }
        );
    }
);

test(
    'send creates a retryable error for HTTP 429',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,

            fetchImpl: async () => createResponse({
                ok: false,
                status: 429,

                body: {
                    error: {
                        message: 'Too many requests.',
                        code: 4
                    }
                }
            })
        });

        await assert.rejects(
            () => transport.send(
                createMessage()
            ),
            (error) => {
                assert.equal(
                    error.name,
                    'WhatsAppTransportApiError'
                );

                assert.equal(
                    error.code,
                    'META_4'
                );

                assert.equal(
                    error.retryable,
                    true
                );

                assert.equal(
                    error.statusCode,
                    429
                );

                return true;
            }
        );
    }
);

test(
    'send creates a retryable error for HTTP 500',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,

            fetchImpl: async () => createResponse({
                ok: false,
                status: 500,

                body: {
                    error: {
                        message: 'Internal server error.',
                        code: 1
                    }
                }
            })
        });

        await assert.rejects(
            () => transport.send(
                createMessage()
            ),
            (error) => {
                assert.equal(
                    error.name,
                    'WhatsAppTransportApiError'
                );

                assert.equal(
                    error.retryable,
                    true
                );

                assert.equal(
                    error.statusCode,
                    500
                );

                return true;
            }
        );
    }
);

test(
    'send converts network failures into retryable transport errors',
    async () => {
        const networkError = new Error(
            'Connection reset.'
        );

        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,

            fetchImpl: async () => {
                throw networkError;
            }
        });

        await assert.rejects(
            () => transport.send(
                createMessage()
            ),
            (error) => {
                assert.equal(
                    error.name,
                    'WhatsAppTransportNetworkError'
                );

                assert.equal(
                    error.code,
                    'WHATSAPP_NETWORK_ERROR'
                );

                assert.equal(
                    error.message,
                    'Connection reset.'
                );

                assert.equal(
                    error.retryable,
                    true
                );

                assert.equal(
                    error.isTransportError,
                    true
                );

                assert.equal(
                    error.cause,
                    networkError
                );

                return true;
            }
        );
    }
);

test(
    'send converts aborted requests into retryable timeout errors',
    async () => {
        const fetchImpl = async (url, options) => {
            return new Promise((resolve, reject) => {
                options.signal.addEventListener(
                    'abort',
                    () => {
                        const error = new Error(
                            'The operation was aborted.'
                        );

                        error.name = 'AbortError';

                        reject(error);
                    }
                );
            });
        };

        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            timeoutMs: 10,
            fetchImpl
        });

        await assert.rejects(
            () => transport.send(
                createMessage()
            ),
            (error) => {
                assert.equal(
                    error.name,
                    'WhatsAppTransportTimeoutError'
                );

                assert.equal(
                    error.code,
                    'WHATSAPP_REQUEST_TIMEOUT'
                );

                assert.equal(
                    error.message,
                    'WhatsApp request exceeded 10ms.'
                );

                assert.equal(
                    error.retryable,
                    true
                );

                assert.equal(
                    error.isTransportError,
                    true
                );

                return true;
            }
        );
    }
);

test(
    'send safely handles a non-JSON successful response',
    async () => {
        const transport = new WhatsAppTransport({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,

            fetchImpl: async () => ({
                ok: true,
                status: 200,

                async text() {
                    return 'accepted';
                }
            })
        });

        const result = await transport.send(
            createMessage()
        );

        assert.equal(
            result.messageId,
            null
        );

        assert.deepEqual(
            result.response,
            {
                raw: 'accepted'
            }
        );
    }
);