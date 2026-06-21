const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Booking = require('../models/booking.model');
const Apartment = require('../models/apartment.model');
const { sanitizePayload, fields, applyFilters, parseSort } = require('../utils/supabaseShape');

const acceptedStatuses = new Set(['accepted', 'confirmed']);
const cancelledStatuses = new Set(['cancelled', 'canceled', 'rejected']);

async function adjustCapacity(booking, nextStatus) {
  const apartment = booking.apartmentId ? await Apartment.findOne({ id: booking.apartmentId }) : null;
  if (!apartment) return;

  const people = booking.people_count || 1;
  const wasAccepted = acceptedStatuses.has(booking.status);
  const willBeAccepted = acceptedStatuses.has(nextStatus);
  const willRelease = wasAccepted && cancelledStatuses.has(nextStatus);

  if (!wasAccepted && willBeAccepted) {
    if (apartment.available_people < people) throw new ApiError(409, 'Not enough available capacity');
    apartment.available_people -= people;
  } else if (willRelease) {
    apartment.available_people = Math.min(apartment.max_people, apartment.available_people + people);
  }

  await apartment.save();
}

const listBookings = asyncHandler(async (req, res) => {
  const filter = applyFilters({}, {
    id: req.query.id,
    clientId: req.query.clientId,
    ownerId: req.query.ownerId,
    apartmentId: req.query.apartmentId,
    status: req.query.status,
  });
  const bookings = await Booking.find(filter).sort(parseSort(req.query, '-createdAt'));
  return res.json(bookings);
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ id: req.params.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  return res.json(booking);
});

const createBooking = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.booking);
  if (!payload.clientId) payload.clientId = req.user.id;
  if (!payload.clientName) payload.clientName = req.user.name;
  if (!payload.status) payload.status = 'pending';

  const booking = await Booking.create(payload);
  return res.status(201).json(booking);
});

const updateStatus = asyncHandler(async (req, res) => {
  const status = String(req.body.status || req.body.p_status || '').toLowerCase().trim();
  const id = req.params.id || req.body.p_booking_id;
  if (!status) throw new ApiError(422, 'status is required');

  const booking = await Booking.findOne({ id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (![booking.clientId, booking.ownerId].includes(req.user.id) && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');

  await adjustCapacity(booking, status);
  booking.status = status;
  await booking.save();
  return res.json(booking);
});

const rateBooking = asyncHandler(async (req, res) => {
  const rating = Number(req.body.rating || req.body.p_rating);
  const id = req.params.id || req.body.p_booking_id;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError(422, 'rating must be 1-5');

  const booking = await Booking.findOne({ id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.clientId !== req.user.id && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');

  booking.rating = rating;
  booking.rated_at = new Date();
  await booking.save();

  const apartment = booking.apartmentId ? await Apartment.findOne({ id: booking.apartmentId }) : null;
  if (apartment) {
    const ratedBookings = await Booking.find({ apartmentId: apartment.id, rating: { $ne: null } });
    apartment.rating_count = ratedBookings.length;
    apartment.rating_sum = ratedBookings.reduce((sum, item) => sum + (item.rating || 0), 0);
    apartment.rating_average = apartment.rating_count ? apartment.rating_sum / apartment.rating_count : 0;
    await apartment.save();
  }

  return res.json(booking);
});

module.exports = {
  listBookings,
  getBooking,
  createBooking,
  updateStatus,
  rateBooking,
};
