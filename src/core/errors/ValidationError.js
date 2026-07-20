const AppError = require('./AppError');

class ValidationError extends AppError {
  constructor(message = 'Validation error') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

module.exports = ValidationError;