const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const User = require('../models/user.model');
const { buildSession } = require('../utils/session');
const { signPasswordResetToken } = require('../utils/tokens');
const { sendPasswordResetOTP } = require('../services/email.service');
const jwt = require('jsonwebtoken');

const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) throw new ApiError(422, 'name, email, and password are required');

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw new ApiError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const profile = sanitizePayload(req.body, fields.user);
  const user = await User.create({ ...profile, email, name, authProvider: 'password', passwordHash });
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

/**
 * Generate a 6-digit OTP, save it on the user, and email it.
 * In development mode the OTP is also returned in the response for testing.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(422, 'email is required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+resetOtp +resetOtpExpiry');

  const response = {
    message: 'If this email exists, a password reset code has been sent.',
  };

  if (user) {
    // Generate a 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetOtp = otp;
    user.resetOtpExpiry = otpExpiry;
    await user.save();

    // Send OTP via email
    try {
      await sendPasswordResetOTP(user.email, otp);
      response.emailSent = true;
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
      // In development, still return the OTP so testing can proceed
      if (!env.isProduction) {
        response.emailSent = false;
        response.emailError = emailError.message;
      }
    }

    // In development mode, also expose OTP and resetToken for testing
    if (!env.isProduction) {
      response.otp = otp;
      response.resetToken = signPasswordResetToken(user);
      response.note = 'Development only: OTP and resetToken exposed for testing.';
    }
  }

  return res.json(response);
});

/**
 * Verify the 6-digit OTP and return a reset token if valid.
 */
const verifyResetOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) throw new ApiError(422, 'email and otp are required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+resetOtp +resetOtpExpiry');
  if (!user) throw new ApiError(401, 'Invalid email or OTP');

  if (!user.resetOtp || !user.resetOtpExpiry) {
    throw new ApiError(401, 'No password reset was requested. Please request a new code.');
  }

  if (new Date() > user.resetOtpExpiry) {
    // Clear expired OTP
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    await user.save();
    throw new ApiError(401, 'OTP has expired. Please request a new code.');
  }

  if (user.resetOtp !== String(otp).trim()) {
    throw new ApiError(401, 'Invalid OTP code.');
  }

  // OTP is valid – clear it so it can't be reused
  user.resetOtp = null;
  user.resetOtpExpiry = null;
  await user.save();

  // Return a password reset token (JWT) the client will use to set the new password
  const resetToken = signPasswordResetToken(user);

  return res.json({
    message: 'OTP verified successfully.',
    resetToken,
  });
});

const confirmPasswordReset = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw new ApiError(422, 'token and password are required');

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.resetSecret);
  } catch (_error) {
    throw new ApiError(401, 'Invalid or expired reset token');
  }

  if (decoded.type !== 'password_reset') throw new ApiError(401, 'Invalid reset token');

  const user = await User.findOne({ id: decoded.sub });
  if (!user) throw new ApiError(404, 'User not found');

  user.passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  await user.save();
  return res.json({ user: user.toJSON(), session: buildSession(user) });
});

const updatePassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) throw new ApiError(422, 'password is required');

  req.user.passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  await req.user.save();
  return res.json(req.user.toJSON());
});

const exchangeSession = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Authentication required');
  const session = buildSession(req.user);
  return res.json({ user: req.user.toJSON(), session });
});

const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) throw new ApiError(422, 'password is required to confirm account deletion');

  // Verify the user's password before proceeding
  const user = await User.findOne({ id: req.user.id }).select('+passwordHash');
  if (!user) throw new ApiError(404, 'User not found');

  const isGoogleAccount =
    user.authProvider === 'google' || user.passwordHash === 'external-auth-placeholder';

  if (!isGoogleAccount) {
    if (!password) throw new ApiError(422, 'password is required to confirm account deletion');
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) throw new ApiError(401, 'Invalid password');
  }

  const Apartment = require('../models/apartment.model');
  const Booking = require('../models/booking.model');
  const Notification = require('../models/notification.model');
  const Chat = require('../models/chat.model');
  const Message = require('../models/message.model');

  const userId = user.id;

  // Delete all apartments owned by this user
  await Apartment.deleteMany({ ownerId: userId });

  // Delete all bookings where user is client or owner
  await Booking.deleteMany({ $or: [{ clientId: userId }, { ownerId: userId }] });

  // Delete all notifications sent to or from this user
  await Notification.deleteMany({ $or: [{ receiverId: userId }, { senderId: userId }] });

  // Find chats the user is part of, delete their messages, then delete the chats
  const userChats = await Chat.find({ users: userId });
  const chatIds = userChats.map((c) => c.id);
  if (chatIds.length > 0) {
    await Message.deleteMany({ chat_id: { $in: chatIds } });
    await Chat.deleteMany({ users: userId });
  }

  // Also delete any messages sent by this user in other chats
  await Message.deleteMany({ senderId: userId });

  // Finally delete the user
  await user.deleteOne();

  return res.json({ message: 'Account and all associated data deleted successfully' });
});

// Keep the import for sanitizePayload
const { sanitizePayload, fields } = require('../utils/supabaseShape');

module.exports = {
  register,
  login,
  me,
  logout,
  resetPassword,
  verifyResetOTP,
  confirmPasswordReset,
  updatePassword,
  exchangeSession,
  deleteAccount,
};
