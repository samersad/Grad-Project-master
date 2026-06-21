const { signAccessToken, signRefreshToken } = require('./tokens');

function secondsFromExpiry(value) {
  const raw = String(value || '15m').trim();
  const match = raw.match(/^(\d+)([smhd])?$/i);
  if (!match) return 900;

  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}

function buildSession(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, `${user.id}:${Date.now()}`);
  const expiresIn = secondsFromExpiry(process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: user.toJSON(),
  };
}

module.exports = { buildSession };
