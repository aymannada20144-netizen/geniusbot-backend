'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const MessageFactory = require(
    '../../../src/communication/factories/MessageFactory'
);

const MessageTypes = require(
    '../../../src/communication/types/MessageTypes'
);

describe('MessageFactory', () => {

    const validAppointmentPayload = {
        phone: '966500000000',
        serviceName: 'Dermatology',
        patientName: 'محمد أحمد',
        doctorName: 'د. نوف الراجحي',
        branchName: 'فرع الروضة',
        roomName: '201',
        appointmentDate: '2026-08-10',
        appointmentTime: '18:00',
        appointmentNumber: 'APT-1001',
        appointmentId: 'APT-1001',
        patientId: 'PAT-1001',
        clinicId: 'CLN-1001'
    };

    const validThankYouPayload = {
        phone: '966500000000',
        patientName: 'محمد أحمد',
        appointmentNumber: 'APT-1001',
        appointmentId: 'APT-1001',
        patientId: 'PAT-1001',
        clinicId: 'CLN-1001'
    };

    test('should build appointment confirmation message', () => {

        const message = MessageFactory.build(
            MessageTypes.APPOINTMENT_CONFIRMATION,
            validAppointmentPayload
        );

        assert.ok(message);
        assert.equal(message.type, MessageTypes.APPOINTMENT_CONFIRMATION);
        assert.equal(message.channel, 'whatsapp');
        assert.equal(message.recipient.phone, validAppointmentPayload.phone);
        assert.equal(message.template.variables.patientName, validAppointmentPayload.patientName);

    });

    test('should build appointment reminder message', () => {

        const message = MessageFactory.build(
            MessageTypes.APPOINTMENT_REMINDER,
            validAppointmentPayload
        );

        assert.ok(message);
        assert.equal(message.type, MessageTypes.APPOINTMENT_REMINDER);
        assert.equal(message.channel, 'whatsapp');
        assert.equal(message.recipient.phone, validAppointmentPayload.phone);
        assert.deepEqual(message.template.variables, {
            patientName: validAppointmentPayload.patientName,
            serviceName: validAppointmentPayload.serviceName,
            doctorName: validAppointmentPayload.doctorName,
            branchName: validAppointmentPayload.branchName,
            appointmentDate: validAppointmentPayload.appointmentDate,
            appointmentTime: validAppointmentPayload.appointmentTime,
            appointmentNumber: validAppointmentPayload.appointmentNumber
        });
        assert.equal(
            Object.hasOwn(message.template.variables, 'roomName'),
            false
        );

    });

    test('should build thank you message', () => {

        const message = MessageFactory.build(
            MessageTypes.THANK_YOU,
            validThankYouPayload
        );

        assert.ok(message);
        assert.equal(message.type, MessageTypes.THANK_YOU);
        assert.equal(message.channel, 'whatsapp');
        assert.equal(message.recipient.phone, validThankYouPayload.phone);
        assert.equal(message.template.variables.patientName, validThankYouPayload.patientName);
        assert.equal(message.template.variables.appointmentNumber, validThankYouPayload.appointmentNumber);

    });

    test('should throw for unknown message type', () => {

        assert.throws(() => {
            MessageFactory.build(
                'invalid_type',
                validAppointmentPayload
            );
        });

    });

    test('should throw when payload is invalid', () => {

        assert.throws(() => {
            MessageFactory.build(
                MessageTypes.APPOINTMENT_CONFIRMATION,
                {}
            );
        });

    });

});
