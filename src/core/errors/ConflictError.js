const AppError = require('./AppError');

class ConflictError extends AppError {
  constructor(message = 'Conflict error') {
    super(message, 409, 'CONFLICT');
  }
}

module.exports = ConflictError;