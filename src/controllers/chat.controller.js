const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Chat = require('../models/chat.model');
const Message = require('../models/message.model');
const Notification = require('../models/notification.model');
const { sanitizePayload, fields } = require('../utils/supabaseShape');

const listChats = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.userId) filter.users = req.query.userId;
  const chats = await Chat.find(filter).sort('-timestamp');
  return res.json(chats);
});

const upsertChat = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.chat);
  if (!payload.id) throw new ApiError(422, 'id is required');

  const chat = await Chat.findOneAndUpdate(
    { id: payload.id },
    payload,
    { new: true, upsert: true, runValidators: true },
  );
  return res.status(201).json(chat);
});

const listMessages = asyncHandler(async (req, res) => {
  const chatId = req.params.chatId || req.query.chat_id || req.query.chatId;
  if (!chatId) throw new ApiError(422, 'chat_id is required');
  const messages = await Message.find({ chat_id: chatId }).sort('timestamp id');
  return res.json(messages);
});

const sendMessage = asyncHandler(async (req, res) => {
  const chatId = req.params.chatId || req.body.chat_id;
  if (!chatId) throw new ApiError(422, 'chat_id is required');

  const chatPayload = sanitizePayload(req.body.chatMetadata || {}, fields.chat);
  const messagePayload = sanitizePayload(req.body.messageData || req.body, fields.message);
  messagePayload.chat_id = chatId;
  if (!messagePayload.senderId) messagePayload.senderId = req.user.id;
  messagePayload.timestamp = new Date();

  await Chat.findOneAndUpdate(
    { id: chatId },
    {
      ...chatPayload,
      id: chatId,
      lastMessage: messagePayload.message,
      timestamp: messagePayload.timestamp,
    },
    { upsert: true, new: true, runValidators: true },
  );

  const message = await Message.create(messagePayload);
  const notificationData = req.body.notificationData;
  if (notificationData?.receiverId) {
    await Notification.create({
      title: `New message from ${notificationData.senderName || req.user.name}`,
      body: notificationData.message || message.message,
      type: 'new_message',
      receiverId: notificationData.receiverId,
      senderId: notificationData.senderId || req.user.id,
      chatId,
      isRead: false,
    });
  }

  return res.status(201).json(message);
});

module.exports = {
  listChats,
  upsertChat,
  listMessages,
  sendMessage,
};
