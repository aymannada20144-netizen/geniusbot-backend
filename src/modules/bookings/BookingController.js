class BookingController {
  constructor(bookingService) {
    if (!bookingService) {
      throw new Error('BookingController requires bookingService');
    }

    this.bookingService = bookingService;
  }

  async bookAppointment(request, reply) {
    const result =
      await this.bookingService.bookAppointment(request.body);

    const statusCode = result.success ? 201 : 400;

    return reply.code(statusCode).send(result);
  }
}

module.exports = BookingController;