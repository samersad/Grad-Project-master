const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

function signRefreshToken(user, sessionId) {
  return jwt.sign({ sub: user.id, role: user.role, sid: sessionId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
}

function signEmailVerificationToken(user) {
  return jwt.sign({ sub: user.id, type: 'email_verification' }, env.jwt.verifySecret, {
    expiresIn: env.jwt.verifyExpiresIn,
  });
}

function signPasswordResetToken(user) {
  return jwt.sign({ sub: user.id, type: 'password_reset' }, env.jwt.resetSecret, {
    expiresIn: env.jwt.resetExpiresIn,
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  signEmailVerificationToken,
  signPasswordResetToken,
  hashToken,
};
