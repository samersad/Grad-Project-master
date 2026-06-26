const mongoose = require('mongoose');
const { uuid, jsonOptions } = require('./base');

const apartmentSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuid, unique: true, index: true },
    name: { type: String, default: null },
    description: { type: String, default: null },
    price: { type: Number, default: null },
    images: { type: [String], default: [] },
    video_url: { type: String, default: null },
    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    living_rooms: { type: Number, default: null },
    floor: { type: Number, default: 1 },
    max_people: { type: Number, default: 1 },
    available_people: { type: Number, default: 1 },
    address: { type: String, default: null },
    city: { type: String, default: 'Assuit' },
    district: { type: String, default: 'فريال' },
    locationAddress: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    ownerId: { type: String, default: null, index: true },
    ownerName: { type: String, default: null },
    ownerPhotoUrl: { type: String, default: null },
    verified: { type: Boolean, default: false },
    rating_sum: { type: Number, default: 0 },
    rating_count: { type: Number, default: 0 },
    rating_average: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    toJSON: jsonOptions,
    toObject: jsonOptions,
  },
);

module.exports = mongoose.model('Apartment', apartmentSchema);
