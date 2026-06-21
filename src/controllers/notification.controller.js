const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/notification.model');
const { sanitizePayload, fields, applyFilters, parseSort } = require('../utils/supabaseShape');

const listNotifications = asyncHandler(async (req, res) => {
  const filter = applyFilters({}, {
    id: req.query.id,
    receiverId: req.query.receiverId,
    senderId: req.query.senderId,
    type: req.query.type,
    isRead: req.query.isRead,
  });
  const notifications = await Notification.find(filter).sort(parseSort(req.query, '-createdAt'));
  return res.json(notifications);
});

const createNotification = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.notification);
  const notification = await Notification.create(payload);
  return res.status(201).json(notification);
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ id: req.params.id }, { isRead: true }, { new: true });
  if (!notification) throw new ApiError(404, 'Notification not found');
  return res.json(notification);
});

const markAllRead = asyncHandler(async (req, res) => {
  const receiverId = req.params.receiverId || req.body.receiverId;
  if (!receiverId) throw new ApiError(422, 'receiverId is required');
  await Notification.updateMany({ receiverId, isRead: false }, { isRead: true });
  const notifications = await Notification.find({ receiverId }).sort('-createdAt');
  return res.json(notifications);
});

module.exports = {
  listNotifications,
  createNotification,
  markRead,
  markAllRead,
};
