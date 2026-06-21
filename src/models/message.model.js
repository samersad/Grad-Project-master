const mongoose = require('mongoose');
const { uuid, jsonOptions } = require('./base');

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuid, unique: true, index: true },
    chat_id: { type: String, default: null, index: true },
    senderId: { type: String, default: null, index: true },
    message: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    toJSON: jsonOptions,
    toObject: jsonOptions,
  },
);

module.exports = mongoose.model('Message', messageSchema);
