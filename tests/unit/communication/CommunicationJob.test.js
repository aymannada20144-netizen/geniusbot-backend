'use strict';

const CommunicationJob = require(
    '../../../src/communication/jobs/CommunicationJob'
);

describe('CommunicationJob', () => {

    const validMessage = Object.freeze({
        type: 'appointment_confirmation',
        channel: 'whatsapp',

        recipient: Object.freeze({
            phone: '966500000000'
        }),

        template: Object.freeze({
            name: 'appointment_confirmation',
            language: 'ar',

            variables: Object.freeze({
                patientName: 'محمد أحمد'
            })
        }),

        metadata: Object.freeze({
            appointmentId: 'APT-1001',
            patientId: 'PAT-1001',
            clinicId: 'CLN-1001',
            priority: 'normal'
        })
    });

    test('should send message successfully on first attempt', async () => {

        const transport = {
            send: jest.fn().mockResolvedValue({
                providerMessageId: 'MSG-1001'
            })
        };

        const job = new CommunicationJob({
            transport,
            maxAttempts: 3,
            retryDelayMs: 0
        });

        const result = await job.execute(validMessage);

        expect(transport.send).toHaveBeenCalledTimes(1);
        expect(transport.send).toHaveBeenCalledWith(validMessage);

        expect(result.success).toBe(true);
        expect(result.status).toBe('sent');
        expect(result.attempts).toBe(1);
        expect(result.messageType).toBe(validMessage.type);
        expect(result.channel).toBe(validMessage.channel);
        expect(result.recipient).toBe(validMessage.recipient.phone);
        expect(result.transportResult).toEqual({
            providerMessageId: 'MSG-1001'
        });
        expect(result.error).toBeNull();
    });

    test('should retry a retryable failure and then succeed', async () => {

        const retryableError = new Error(
            'Temporary transport failure.'
        );

        retryableError.code = 'TRANSPORT_TEMPORARY_FAILURE';
        retryableError.retryable = true;

        const transport = {
            send: jest
                .fn()
                .mockRejectedValueOnce(retryableError)
                .mockResolvedValueOnce({
                    providerMessageId: 'MSG-1002'
                })
        };

        const job = new CommunicationJob({
            transport,
            maxAttempts: 3,
            retryDelayMs: 0
        });

        const result = await job.execute(validMessage);

        expect(transport.send).toHaveBeenCalledTimes(2);

        expect(result.success).toBe(true);
        expect(result.status).toBe('sent');
        expect(result.attempts).toBe(2);
        expect(result.transportResult).toEqual({
            providerMessageId: 'MSG-1002'
        });
    });

    test('should stop immediately for a non-retryable failure', async () => {

        const nonRetryableError = new Error(
            'Invalid recipient phone number.'
        );

        nonRetryableError.code = 'INVALID_RECIPIENT';
        nonRetryableError.retryable = false;

        const transport = {
            send: jest.fn().mockRejectedValue(
                nonRetryableError
            )
        };

        const job = new CommunicationJob({
            transport,
            maxAttempts: 3,
            retryDelayMs: 0
        });

        const result = await job.execute(validMessage);

        expect(transport.send).toHaveBeenCalledTimes(1);

        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.attempts).toBe(1);

        expect(result.error).toEqual({
            name: 'Error',
            code: 'INVALID_RECIPIENT',
            message: 'Invalid recipient phone number.',
            retryable: false
        });
    });

    test('should fail after exhausting all retry attempts', async () => {

        const retryableError = new Error(
            'WhatsApp service unavailable.'
        );

        retryableError.code = 'SERVICE_UNAVAILABLE';
        retryableError.retryable = true;

        const transport = {
            send: jest.fn().mockRejectedValue(
                retryableError
            )
        };

        const job = new CommunicationJob({
            transport,
            maxAttempts: 3,
            retryDelayMs: 0
        });

        const result = await job.execute(validMessage);

        expect(transport.send).toHaveBeenCalledTimes(3);

        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.attempts).toBe(3);

        expect(result.error).toEqual({
            name: 'Error',
            code: 'SERVICE_UNAVAILABLE',
            message: 'WhatsApp service unavailable.',
            retryable: true
        });
    });

    test('should reject an invalid transport', () => {

        expect(() => {
            new CommunicationJob({
                transport: {}
            });
        }).toThrow(
            'CommunicationJob requires a transport with a send(message) function.'
        );

    });

    test('should reject invalid maxAttempts', () => {

        const transport = {
            send: jest.fn()
        };

        expect(() => {
            new CommunicationJob({
                transport,
                maxAttempts: 0
            });
        }).toThrow(
            'CommunicationJob maxAttempts must be a positive integer.'
        );

    });

    test('should reject invalid retryDelayMs', () => {

        const transport = {
            send: jest.fn()
        };

        expect(() => {
            new CommunicationJob({
                transport,
                retryDelayMs: -1
            });
        }).toThrow(
            'CommunicationJob retryDelayMs must be a non-negative number.'
        );

    });

    test('should reject an invalid message', async () => {

        const transport = {
            send: jest.fn()
        };

        const job = new CommunicationJob({
            transport
        });

        await expect(
            job.execute(null)
        ).rejects.toThrow(
            'CommunicationJob message must be an object.'
        );

        expect(transport.send).not.toHaveBeenCalled();
    });

    test('should reject a message without recipient phone', async () => {

        const transport = {
            send: jest.fn()
        };

        const job = new CommunicationJob({
            transport
        });

        const invalidMessage = {
            type: 'appointment_confirmation',
            channel: 'whatsapp',
            recipient: {},
            template: {
                name: 'appointment_confirmation'
            }
        };

        await expect(
            job.execute(invalidMessage)
        ).rejects.toThrow(
            'CommunicationJob message.recipient.phone is required.'
        );

        expect(transport.send).not.toHaveBeenCalled();
    });

});