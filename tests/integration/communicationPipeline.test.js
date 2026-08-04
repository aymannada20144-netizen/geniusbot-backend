'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const MessageFactory = require('../../src/communication/factories/MessageFactory');
const CommunicationJob = require('../../src/communication/jobs/CommunicationJob');
const WhatsAppTransport = require('../../src/communication/transports/WhatsAppTransport');
const appointmentPayload = {
    phone: '966500000000',
    patientName: 'أحمد محمد',
    doctorName: 'د. نوف',
    branchName: 'فرع جدة',
    appointmentDate: '2026-08-10',
    appointmentTime: '18:00',
    appointmentId: 'APT-1001',
    patientId: 'PAT-1001',
    clinicId: 'CLN-1001'
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
