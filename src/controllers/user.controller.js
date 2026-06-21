const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/user.model');
const { sanitizePayload, fields } = require('../utils/supabaseShape');

const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().sort('createdAt');
  return res.json(users);
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ id: req.params.id });
  if (!user) throw new ApiError(404, 'User not found');
  return res.json(user);
});

const upsertUser = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.user);
  if (!payload.id) payload.id = req.user?.id;
  if (!payload.id) throw new ApiError(422, 'id is required');
  if (req.user && req.user.id !== payload.id && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');

  const user = await User.findOneAndUpdate(
    { id: payload.id },
    { $set: payload, $setOnInsert: { passwordHash: req.user?.passwordHash || 'external-auth-placeholder' } },
    { new: true, upsert: true, runValidators: true },
  );
  return res.status(201).json(user);
});

const updateUser = asyncHandler(async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');
  const payload = sanitizePayload(req.body, fields.user);
  delete payload.id;
  delete payload.email;

  const user = await User.findOneAndUpdate({ id: req.params.id }, payload, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'User not found');
  return res.json(user);
});

module.exports = {
  listUsers,
  getUser,
  upsertUser,
  updateUser,
};
