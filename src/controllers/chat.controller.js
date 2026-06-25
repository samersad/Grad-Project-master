const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Chat = require('../models/chat.model');
const Message = require('../models/message.model');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const { sendPushToToken } = require('../services/firebase.service');
const { sanitizePayload, fields } = require('../utils/supabaseShape');

function parseTimestamp(value) {
  if (!value) return null;
  const time = value instanceof Date ? value : new Date(value);
  return Number.isNaN(time.getTime()) ? null : time;
}

function compareTimestampDesc(a, b) {
  const aTime = parseTimestamp(a.timestamp);
  const bTime = parseTimestamp(b.timestamp);
  if (!aTime && !bTime) return 0;
  if (!aTime) return 1;
  if (!bTime) return -1;
  return bTime.getTime() - aTime.getTime();
}

function compareMessagesAsc(a, b) {
  const aTime = parseTimestamp(a.timestamp);
  const bTime = parseTimestamp(b.timestamp);
  if (!aTime && !bTime) return String(a.id || '').localeCompare(String(b.id || ''));
  if (!aTime) return -1;
  if (!bTime) return 1;
  const timeComparison = aTime.getTime() - bTime.getTime();
  return timeComparison || String(a.id || '').localeCompare(String(b.id || ''));
}

function buildChatPreview(message) {
  const normalized = String(message || '').trim();
  if (!normalized) return 'You have a new message.';
  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

const listChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({}).sort('-timestamp');
  const filtered = req.query.userId
    ? chats.filter((chat) => Array.isArray(chat.users) && chat.users.includes(req.query.userId))
    : chats;
  filtered.sort(compareTimestampDesc);
  return res.json(filtered);
});

const getChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findOne({ id: req.params.chatId });
  if (!chat) throw new ApiError(404, 'Chat not found');
  return res.json(chat);
});

const upsertChat = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.chat);
  if (!payload.id) throw new ApiError(422, 'id is required');
  if (!payload.timestamp) payload.timestamp = new Date();

  const chat = await Chat.findOneAndUpdate(
    { id: payload.id },
    payload,
    { new: true, upsert: true, runValidators: true },
  );
  return res.status(201).json(chat);
});

const deleteChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findOne({ id: req.params.chatId });
  if (!chat) throw new ApiError(404, 'Chat not found');
  await Message.deleteMany({ chat_id: req.params.chatId });
  await chat.deleteOne();
  return res.json([chat]);
});

const listMessages = asyncHandler(async (req, res) => {
  const chatId = req.params.chatId || req.query.chat_id || req.query.chatId;
  if (!chatId) throw new ApiError(422, 'chat_id is required');
  const messages = await Message.find({ chat_id: chatId }).sort('timestamp id');
  messages.sort(compareMessagesAsc);
  return res.json(messages);
});

const sendMessage = asyncHandler(async (req, res) => {
  const chatId = req.params.chatId || req.body.chat_id;
  if (!chatId) throw new ApiError(422, 'chat_id is required');

  const now = new Date();
  const chatPayload = sanitizePayload(req.body.chatMetadata || {}, fields.chat);
  const messagePayload = sanitizePayload(req.body.messageData || req.body, fields.message);
  messagePayload.chat_id = chatId;
  if (!messagePayload.senderId) messagePayload.senderId = req.user.id;
  if (!messagePayload.timestamp) messagePayload.timestamp = now;

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
    const title = `New message from ${notificationData.senderName || req.user.name}`;
    const body = buildChatPreview(notificationData.message || message.message);
    await Notification.create({
      title,
      body,
      type: 'new_message',
      receiverId: notificationData.receiverId,
      senderId: notificationData.senderId || req.user.id,
      chatId,
      isRead: false,
      createdAt: new Date(),
    });

    const receiver = await User.findOne({ id: notificationData.receiverId });
    if (receiver?.fcmToken) {
      try {
        await sendPushToToken({
          token: receiver.fcmToken,
          title,
          body,
          imageUrl: req.user.photoUrl,
          data: {
            type: 'new_message',
            receiverId: notificationData.receiverId,
            senderId: notificationData.senderId || req.user.id,
            chatId,
            imageUrl: req.user.photoUrl,
          },
        });
      } catch (error) {
        console.error('Chat push notification failed:', error.message);
      }
    }
  }

  return res.status(201).json(message);
});

const deleteMessage = asyncHandler(async (req, res) => {
  const message = await Message.findOne({ id: req.params.id });
  if (!message) throw new ApiError(404, 'Message not found');
  await message.deleteOne();
  return res.json([message]);
});

module.exports = {
  listChats,
  getChat,
  upsertChat,
  deleteChat,
  listMessages,
  sendMessage,
  deleteMessage,
};
