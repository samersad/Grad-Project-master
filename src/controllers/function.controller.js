const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const { sendPushToToken } = require('../services/firebase.service');

async function sendNotificationPush({
  receiverId,
  title,
  body,
  type,
  bookingId,
  chatId,
  senderId,
}) {
  if (!receiverId) return { sent: false, reason: 'missing_receiver_id' };

  const receiver = await User.findOne({ id: receiverId });
  if (!receiver?.fcmToken) return { sent: false, reason: 'receiver_has_no_token' };

  const sender = senderId ? await User.findOne({ id: senderId }) : null;
  return sendPushToToken({
    token: receiver.fcmToken,
    title,
    body,
    imageUrl: sender?.photoUrl,
    data: {
      type,
      receiverId,
      senderId,
      bookingId,
      chatId,
      imageUrl: sender?.photoUrl,
    },
  });
}

const sendBookingNotification = asyncHandler(async (req, res) => {
  const receiverId = req.body.ownerId || req.body.receiverId;
  const title = req.body.title || 'New Booking Request';
  const body = req.body.body;
  const type = req.body.type || 'new_booking';
  const notification = await Notification.create({
    title,
    body,
    type,
    receiverId,
    bookingId: req.body.bookingId,
    isRead: false,
  });
  let push = { sent: false, reason: 'skipped' };
  try {
    push = await sendNotificationPush({
      receiverId,
      title,
      body,
      type,
      bookingId: req.body.bookingId,
    });
  } catch (error) {
    console.error('Booking push notification failed:', error.message);
  }
  return res.json({ sent: push.sent, push, notification });
});

const sendChatNotification = asyncHandler(async (req, res) => {
  const title = req.body.title || 'New message';
  const body = req.body.body;
  const type = req.body.type || 'new_message';
  const notification = await Notification.create({
    title,
    body,
    type,
    receiverId: req.body.receiverId,
    senderId: req.body.senderId,
    chatId: req.body.chatId,
    isRead: false,
  });
  let push = { sent: false, reason: 'skipped' };
  try {
    push = await sendNotificationPush({
      receiverId: req.body.receiverId,
      title,
      body,
      type,
      senderId: req.body.senderId,
      chatId: req.body.chatId,
    });
  } catch (error) {
    console.error('Chat push notification failed:', error.message);
  }
  return res.json({ sent: push.sent, push, notification });
});

const sendBookingStatusNotification = asyncHandler(async (req, res) => {
  const title = req.body.title;
  const body = req.body.body;
  const type = req.body.type;
  const notification = await Notification.create({
    title,
    body,
    type,
    receiverId: req.body.receiverId,
    bookingId: req.body.bookingId,
    isRead: false,
  });
  let push = { sent: false, reason: 'skipped' };
  try {
    push = await sendNotificationPush({
      receiverId: req.body.receiverId,
      title,
      body,
      type,
      bookingId: req.body.bookingId,
    });
  } catch (error) {
    console.error('Booking status push notification failed:', error.message);
  }
  return res.json({ sent: push.sent, push, notification });
});

module.exports = {
  sendBookingNotification,
  sendChatNotification,
  sendBookingStatusNotification,
};
