'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const MessageFactory = require('../../src/communication/factories/MessageFactory');
const CommunicationJob = require('../../src/communication/jobs/CommunicationJob');
const WhatsAppTransport = require('../../src/communication/transports/WhatsAppTransport');
const appointmentPayload = {
    phone: '966500000000',
    serviceName: 'Dermatology',
    patientName: 'أحمد محمد',
    doctorName: 'د. نوف',
    branchName: 'فرع جدة',
    appointmentDate: '2026-08-10',
    appointmentTime: '18:00',
    appointmentNumber: 'APT-1001',
    appointmentId: 'APT-1001',
    patientId: 'PAT-1001',
    clinicId: 'CLN-1001'
};
const reminderPayload = {
    ...appointmentPayload,
    appointmentNumber: 'APT-1001'
};
test(
    'communication pipeline delivers an appointment confirmation successfully',
    async () => {

        let sendCount = 0;

        const fetchImpl = async () => {

            sendCount++;

            return {
                ok: true,
                status: 200,

                async text() {

                    return JSON.stringify({

                        messages: [
                            {
                                id: 'wamid.integration'
                            }
                        ]

                    });

                }

            };

        };

        const transport = new WhatsAppTransport({

            token: 'token',
            phoneNumberId: '123456',
            fetchImpl

        });

        const MessageTypes = require('../../src/communication/types/MessageTypes');

const message = MessageFactory.build(
    MessageTypes.APPOINTMENT_CONFIRMATION,
    appointmentPayload
);

        const job =
            new CommunicationJob({

                transport

            });

        const result =
            await job.execute(message);

        assert.equal(
            result.success,
            true
        );

        assert.equal(
            result.status,
            'sent'
        );

        assert.equal(
            result.attempts,
            1
        );

        assert.equal(
            sendCount,
            1
        );

        assert.equal(
            result.transportResult.messageId,
            'wamid.integration'
        );

    }
);

test(
    'communication pipeline sends ordered appointment reminder parameters',
    async () => {
        let capturedPayload = null;
        const transport = new WhatsAppTransport({
            token: 'token',
            phoneNumberId: '123456',
            fetchImpl: async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    status: 200,
                    async text() {
                        return JSON.stringify({
                            messages: [{ id: 'wamid.reminder' }]
                        });
                    }
                };
            }
        });
        const MessageTypes = require('../../src/communication/types/MessageTypes');
        const message = MessageFactory.build(
            MessageTypes.APPOINTMENT_REMINDER,
            reminderPayload
        );
        const result = await new CommunicationJob({ transport }).execute(message);

        assert.equal(result.success, true);
        assert.equal(capturedPayload.template.name, 'appointment_reminder');
        assert.deepEqual(
            capturedPayload.template.components[0].parameters.map(
                (parameter) => parameter.text
            ),
            [
                reminderPayload.patientName,
                reminderPayload.serviceName,
                reminderPayload.doctorName,
                reminderPayload.branchName,
                reminderPayload.appointmentDate,
                reminderPayload.appointmentTime,
                reminderPayload.appointmentNumber
            ]
        );
    }
);

for (const scenario of [
    {
        name: 'thank_you',
        type: 'thank_you',
        payload: {
            phone: '966500000000',
            patientName: 'Patient',
            appointmentNumber: 'APT-1001',
            appointmentId: 'APT-1001',
            patientId: 'PAT-1001',
            clinicId: 'CLN-1001'
        },
        ordered: ['Patient', 'APT-1001']
    },
    {
        name: 'google_review',
        type: 'google_review',
        payload: {
            phone: '966500000000',
            patientName: 'Patient',
            reviewUrl: 'https://maps.google.com/test',
            appointmentId: 'APT-1001',
            patientId: 'PAT-1001',
            clinicId: 'CLN-1001'
        },
        ordered: ['Patient', 'https://maps.google.com/test']
    }
]) {
    test(`communication pipeline sends ordered ${scenario.name} parameters`, async () => {
        let capturedPayload = null;
        const transport = new WhatsAppTransport({
            token: 'token',
            phoneNumberId: '123456',
            fetchImpl: async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    status: 200,
                    async text() {
                        return JSON.stringify({ messages: [{ id: 'wamid.test' }] });
                    }
                };
            }
        });
        const message = MessageFactory.build(scenario.type, scenario.payload);
        const result = await new CommunicationJob({ transport }).execute(message);
        assert.equal(result.success, true);
        assert.equal(capturedPayload.template.name, scenario.name);
        assert.deepEqual(
            capturedPayload.template.components[0].parameters.map(
                (parameter) => parameter.text
            ),
            scenario.ordered
        );
    });
}
