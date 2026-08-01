'use strict';

const AppError = require('../errors/AppError');
const mapPostgresError = require('../errors/postgresErrorMapper');

function errorHandler(error, request, reply) {
  request.log.error(error);

  const mappedError = mapPostgresError(error);

  if (mappedError) {
    error = mappedError;
  }

  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      },
    });
  }

  return reply.code(500).send({
    success: false,
      error: {
        name: 'InternalServerError',
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      statusCode: 500,
    },
  });
}

module.exports = errorHandler;
