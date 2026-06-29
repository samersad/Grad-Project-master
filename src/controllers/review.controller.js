const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Booking = require('../models/booking.model');
const Apartment = require('../models/apartment.model');
const User = require('../models/user.model');

const rateableStatuses = new Set(['accepted', 'confirmed', 'approved', 'completed']);

function serializeReview(booking, user) {
  const createdAt = booking.rated_at || booking.createdAt;
  return {
    id: booking.id,
    _id: booking.id,
    apartmentId: booking.apartmentId,
    bookingId: booking.id,
    rating: booking.rating,
    comment: '',
    userName: user?.name || booking.clientName || '',
    userAvatar: user?.photoUrl || '',
    createdAt,
  };
}

async function recalculateApartmentRating(apartmentId) {
  const apartment = apartmentId ? await Apartment.findOne({ id: apartmentId }) : null;
  if (!apartment) return null;

  const ratedBookings = await Booking.find({
    apartmentId,
    rating: { $ne: null },
    status: { $in: Array.from(rateableStatuses) },
  });

  apartment.rating_count = ratedBookings.length;
  apartment.rating_sum = ratedBookings.reduce((sum, item) => sum + (item.rating || 0), 0);
  apartment.rating_average = apartment.rating_count ? apartment.rating_sum / apartment.rating_count : 0;
  await apartment.save();

  return apartment;
}

const listApartmentReviews = asyncHandler(async (req, res) => {
  const apartmentId = req.params.apartmentId || req.query.apartmentId;
  if (!apartmentId) throw new ApiError(422, 'apartmentId is required');

  const bookings = await Booking.find({
    apartmentId,
    rating: { $ne: null },
    status: { $in: Array.from(rateableStatuses) },
  }).sort('-rated_at -createdAt');

  const userIds = [...new Set(bookings.map((booking) => booking.clientId).filter(Boolean))];
  const users = userIds.length ? await User.find({ id: { $in: userIds } }) : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  return res.json({
    reviews: bookings.map((booking) => serializeReview(booking, usersById.get(booking.clientId))),
  });
});

const createReview = asyncHandler(async (req, res) => {
  const apartmentId = String(req.body.apartmentId || '').trim();
  const rating = Number(req.body.rating || req.body.score);

  if (!apartmentId) throw new ApiError(422, 'apartmentId is required');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError(422, 'rating must be 1-5');

  const booking = await Booking.findOne({
    apartmentId,
    clientId: req.user.id,
    status: { $in: Array.from(rateableStatuses) },
  }).sort('-createdAt');

  if (!booking) {
    throw new ApiError(403, 'Only clients with an approved booking can review this apartment');
  }

  booking.rating = rating;
  booking.rated_at = new Date();
  await booking.save();

  await recalculateApartmentRating(apartmentId);

  return res.status(201).json({ review: serializeReview(booking, req.user) });
});

module.exports = {
  createReview,
  listApartmentReviews,
  recalculateApartmentRating,
};
