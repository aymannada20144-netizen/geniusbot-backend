class AppointmentController {
    constructor(appointmentService) {
        if (!appointmentService) {
            throw new Error('AppointmentController requires appointmentService');
        }

        this.appointmentService = appointmentService;
    }

    async getUpcomingAppointment(request, reply) {
        const { clinicId, patientId } = request.params;

        const appointment = await this.appointmentService.getUpcomingAppointment(
            clinicId,
            patientId
        );

        return reply.send({
            success: true,
            data: appointment
        });
    }

    async getAppointmentHistory(request, reply) {
        const { clinicId, patientId } = request.params;

        const appointments = await this.appointmentService.getAppointmentHistory(
            clinicId,
            patientId
        );

        return reply.send({
            success: true,
            data: appointments
        });
    }

    async cancelAppointment(request, reply) {
        const { clinicId, appointmentId } = request.params;
        const { reason } = request.body || {};

        const appointment = await this.appointmentService.cancelAppointment(
            clinicId,
            appointmentId,
            reason
        );

        return reply.send({
            success: true,
            data: appointment
        });
    }

    async completeAppointment(request, reply) {
        const { clinicId, appointmentId } = request.params;

        const appointment = await this.appointmentService.completeAppointment(
            clinicId,
            appointmentId
        );

        return reply.send({
            success: true,
            data: appointment
        });
    }

    async markAppointmentAsNoShow(request, reply) {
        const { clinicId, appointmentId } = request.params;

        const appointment = await this.appointmentService.markAppointmentAsNoShow(
            clinicId,
            appointmentId
        );

        return reply.send({
            success: true,
            data: appointment
        });
    }

    async rescheduleAppointment(request, reply) {
        const { clinicId, appointmentId } = request.params;
        const { appointmentStart, appointmentEnd } = request.body || {};

        const appointment = await this.appointmentService.rescheduleAppointment(
            clinicId,
            appointmentId,
            appointmentStart,
            appointmentEnd
        );

        return reply.send({
            success: true,
            data: appointment
        });
    }
}

module.exports = AppointmentController;