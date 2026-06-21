const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const User = require('../models/user.model');
const { buildSession } = require('../utils/session');
const { sanitizePayload, fields } = require('../utils/supabaseShape');

const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) throw new ApiError(422, 'name, email, and password are required');

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw new ApiError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const profile = sanitizePayload(req.body, fields.user);
  const user = await User.create({ ...profile, email, name, passwordHash });
  const session = buildSession(user);

  return res.status(201).json({ user: user.toJSON(), session });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(422, 'email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user) throw new ApiError(401, 'Invalid email or password');

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw new ApiError(401, 'Invalid email or password');

  const session = buildSession(user);
  return res.json({ user: user.toJSON(), session });
});

const me = asyncHandler(async (req, res) => {
  return res.json(req.user.toJSON());
});

const logout = asyncHandler(async (_req, res) => {
  return res.json({ signedOut: true });
});

const resetPassword = asyncHandler(async (_req, res) => {
  return res.json({ message: 'Password reset email delivery is not configured for the replacement backend.' });
});

const updatePassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) throw new ApiError(422, 'password is required');

  req.user.passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  await req.user.save();
  return res.json(req.user.toJSON());
});

module.exports = {
  register,
  login,
  me,
  logout,
  resetPassword,
  updatePassword,
};
