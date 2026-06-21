const mongoose = require('mongoose');
const { uuid, jsonOptions } = require('./base');

const bookingSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuid, unique: true, index: true },
    apartmentId: { type: String, default: null, index: true },
    apartmentName: { type: String, default: null },
    apartmentAddress: { type: String, default: null },
    apartmentImage: { type: String, default: null },
    clientId: { type: String, default: null, index: true },
    clientName: { type: String, default: null },
    ownerId: { type: String, default: null, index: true },
    ownerName: { type: String, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    totalPrice: { type: Number, default: null },
    people_count: { type: Number, default: 1 },
    rating: { type: Number, min: 1, max: 5, default: null },
    rated_at: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'accepted', 'confirmed', 'cancelled', 'canceled', 'rejected'], default: 'pending' },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    toJSON: jsonOptions,
    toObject: jsonOptions,
  },
);

module.exports = mongoose.model('Booking', bookingSchema);
