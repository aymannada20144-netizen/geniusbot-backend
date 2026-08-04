'use strict';

require('dotenv').config();

const MessageFactory = require(
    '../../src/communication/factories/MessageFactory'
);

const MessageTypes = require(
    '../../src/communication/types/MessageTypes'
);

const CommunicationJob = require(
    '../../src/communication/jobs/CommunicationJob'
);

const WhatsAppTransport = require(
    '../../src/communication/transports/WhatsAppTransport'
);

async function run() {

    const requiredEnvironmentVariables = [
        'WHATSAPP_TOKEN',
        'PHONE_NUMBER_ID'
    ];

    const missingEnvironmentVariables =
        requiredEnvironmentVariables.filter(
            (name) => !process.env[name]
        );

    if (missingEnvironmentVariables.length > 0) {
        throw new Error(
            `Missing environment variables: ${missingEnvironmentVariables.join(', ')}`
        );
    }

    const payload = {
        phone: '966568991978',

        patientName: 'أيمن',
        serviceName: 'كشف جلدية',
        doctorName: 'د. نوف الراجحي',
        branchName: 'فرع الروضة',

        appointmentDate: '2026-08-10',
        appointmentTime: '06:00 مساءً',

        appointmentNumber: 'APT-1001',

        appointmentId: '11111111-1111-4111-8111-111111111111',
        patientId: '22222222-2222-4222-8222-222222222222',
        clinicId: '33333333-3333-4333-8333-333333333333'
    };

    const transport = new WhatsAppTransport({
        token: process.env.WHATSAPP_TOKEN,
        phoneNumberId: process.env.PHONE_NUMBER_ID
    });

    const message = MessageFactory.build(
        MessageTypes.APPOINTMENT_CONFIRMATION,
        payload
    );

    console.log(
        'Built message:',
        JSON.stringify(message, null, 2)
    );

    const communicationJob = new CommunicationJob({
        transport
    });

    const result = await communicationJob.execute(message);

    console.log(
        'Delivery result:',
        JSON.stringify(result, null, 2)
    );

    if (!result.success) {
        process.exitCode = 1;
    }

}

run().catch((error) => {

    console.error('Appointment confirmation test failed.');
    console.error(error);

    if (error.cause) {
        console.error('Cause:', error.cause);
    }

    process.exitCode = 1;

});