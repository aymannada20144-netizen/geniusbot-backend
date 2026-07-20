'use strict';

const bcrypt = require('bcrypt');

const DEFAULT_ROUNDS = 12;

class PasswordHasher {
  constructor(options = {}) {
    this.rounds = Number(options.rounds || process.env.BCRYPT_ROUNDS || DEFAULT_ROUNDS);

    if (!Number.isInteger(this.rounds) || this.rounds < 10) {
      throw new Error('BCRYPT_ROUNDS must be an integer greater than or equal to 10.');
    }
  }

  async hash(plainPassword) {
    this.#validatePassword(plainPassword);

    return bcrypt.hash(plainPassword, this.rounds);
  }

  async verify(plainPassword, passwordHash) {
    this.#validatePassword(plainPassword);

    if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
      return false;
    }

    return bcrypt.compare(plainPassword, passwordHash);
  }

  needsRehash(passwordHash) {
    if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
      return true;
    }

    const parts = passwordHash.split('$');

    if (parts.length < 3) {
      return true;
    }

    const currentRounds = Number(parts[2]);

    if (!Number.isInteger(currentRounds)) {
      return true;
    }

    return currentRounds !== this.rounds;
  }

  #validatePassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
      throw new TypeError('Password must be a non-empty string.');
    }
  }
}

module.exports = PasswordHasher;