const AppError = require('./AppError');

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

module.exports = AuthenticationError;