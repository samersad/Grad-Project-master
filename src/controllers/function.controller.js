const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/notification.model');

const sendBookingNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create({
    title: req.body.title || 'New Booking Request',
    body: req.body.body,
    type: req.body.type || 'new_booking',
    receiverId: req.body.ownerId || req.body.receiverId,
    bookingId: req.body.bookingId,
    isRead: false,
  });
  return res.json({ sent: false, notification });
});

const sendChatNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create({
    title: req.body.title || 'New message',
    body: req.body.body,
    type: req.body.type || 'new_message',
    receiverId: req.body.receiverId,
    senderId: req.body.senderId,
    chatId: req.body.chatId,
    isRead: false,
  });
  return res.json({ sent: false, notification });
});

const sendBookingStatusNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create({
    title: req.body.title,
    body: req.body.body,
    type: req.body.type,
    receiverId: req.body.receiverId,
    bookingId: req.body.bookingId,
    isRead: false,
  });
  return res.json({ sent: false, notification });
});

module.exports = {
  sendBookingNotification,
  sendChatNotification,
  sendBookingStatusNotification,
};
