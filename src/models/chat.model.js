const mongoose = require('mongoose');
const { uuid, jsonOptions } = require('./base');

const chatSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuid, unique: true, index: true },
    users: { type: [String], default: [], index: true },
    lastMessage: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
    displayNames: { type: mongoose.Schema.Types.Mixed, default: null },
    displayPhotos: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: false,
    toJSON: jsonOptions,
    toObject: jsonOptions,
  },
);

module.exports = mongoose.model('Chat', chatSchema);
