const mongoose = require('mongoose');
const { uuid, jsonOptions } = require('./base');

const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuid, unique: true, index: true },
    title: { type: String, default: null },
    body: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    type: { type: String, default: null },
    receiverId: { type: String, default: null, index: true },
    bookingId: { type: String, default: null },
    chatId: { type: String, default: null },
    senderId: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    toJSON: jsonOptions,
    toObject: jsonOptions,
  },
);

module.exports = mongoose.model('Notification', notificationSchema);
