'use strict';

const MessageFactory = require(
    '../../../src/communication/factories/MessageFactory'
);

const MessageTypes = require(
    '../../../src/communication/types/MessageTypes'
);

describe('MessageFactory', () => {

    const validAppointmentPayload = {
        phone: '966500000000',
        patientName: 'محمد أحمد',
        doctorName: 'د. نوف الراجحي',
        branchName: 'فرع الروضة',
        roomName: '201',
        appointmentDate: '2026-08-10',
        appointmentTime: '18:00',
        appointmentId: 'APT-1001',
        patientId: 'PAT-1001',
        clinicId: 'CLN-1001'
    };

    const validThankYouPayload = {
        phone: '966500000000',
        patientName: 'محمد أحمد',
        clinicName: 'عيادات أوريان',
        doctorName: 'د. نوف الراجحي',
        appointmentId: 'APT-1001',
        patientId: 'PAT-1001',
        clinicId: 'CLN-1001'
    };

    test('should build appointment confirmation message', () => {

        const message = MessageFactory.build(
            MessageTypes.APPOINTMENT_CONFIRMATION,
            validAppointmentPayload
        );

        expect(message).toBeDefined();

        expect(message.type)
            .toBe(MessageTypes.APPOINTMENT_CONFIRMATION);

        expect(message.channel)
            .toBe('whatsapp');

        expect(message.recipient.phone)
            .toBe(validAppointmentPayload.phone);

        expect(message.template.variables.patientName)
            .toBe(validAppointmentPayload.patientName);

    });

    test('should build appointment reminder message', () => {

        const message = MessageFactory.build(
            MessageTypes.APPOINTMENT_REMINDER,
            validAppointmentPayload
        );

        expect(message).toBeDefined();

        expect(message.type)
            .toBe(MessageTypes.APPOINTMENT_REMINDER);

        expect(message.channel)
            .toBe('whatsapp');

        expect(message.recipient.phone)
            .toBe(validAppointmentPayload.phone);

        expect(message.template.variables.patientName)
            .toBe(validAppointmentPayload.patientName);

    });

    test('should build thank you message', () => {

        const message = MessageFactory.build(
            MessageTypes.THANK_YOU,
            validThankYouPayload
        );

        expect(message).toBeDefined();

        expect(message.type)
            .toBe(MessageTypes.THANK_YOU);

        expect(message.channel)
            .toBe('whatsapp');

        expect(message.recipient.phone)
            .toBe(validThankYouPayload.phone);

        expect(message.template.variables.patientName)
            .toBe(validThankYouPayload.patientName);

        expect(message.template.variables.clinicName)
            .toBe(validThankYouPayload.clinicName);

    });

    test('should throw for unknown message type', () => {

        expect(() => {
            MessageFactory.build(
                'invalid_type',
                validAppointmentPayload
            );
        }).toThrow();

    });

    test('should throw when payload is invalid', () => {

        expect(() => {
            MessageFactory.build(
                MessageTypes.APPOINTMENT_CONFIRMATION,
                {}
            );
        }).toThrow();

    });

});