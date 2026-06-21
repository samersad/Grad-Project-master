const mongoose = require('mongoose');
const { uuid, jsonOptions } = require('./base');

const userSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuid, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    college: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    gender: { type: String, default: null },
    role: { type: String, enum: ['owner', 'client', 'admin', null], default: null },
    photoUrl: { type: String, default: null },
    fcmToken: { type: String, default: null },
    passwordHash: { type: String, required: true, select: false },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    toJSON: jsonOptions,
    toObject: jsonOptions,
  },
);

module.exports = mongoose.model('User', userSchema);
