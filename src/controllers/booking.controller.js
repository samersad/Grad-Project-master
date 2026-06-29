const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Booking = require('../models/booking.model');
const Apartment = require('../models/apartment.model');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const { sendPushToToken } = require('../services/firebase.service');
const { sanitizePayload, fields, applyFilters, parseSort } = require('../utils/supabaseShape');

const acceptedStatuses = new Set(['accepted', 'confirmed']);
const terminalReleaseStatuses = new Set(['pending', 'cancelled', 'canceled', 'rejected']);
const supportedStatuses = new Set(['pending', 'accepted', 'confirmed', 'cancelled', 'canceled', 'rejected']);

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase().trim();
  if (!value) throw new ApiError(422, 'status is required');
  if (!supportedStatuses.has(value)) throw new ApiError(422, `Unsupported booking status: ${value}`);
  return value;
}

function peopleCount(booking) {
  return Math.max(Number(booking.people_count || 1), 1);
}

function activeBookingFilter(clientId, apartmentId) {
  return {
    clientId,
    apartmentId,
    status: { $nin: ['cancelled', 'canceled', 'rejected'] },
  };
}

function bookingIdFromRequest(req) {
  const paramsId = req.params.id;
  const bodyId = req.body.bookingId || req.body.booking_id || req.body.bookingID || req.body.p_booking_id || req.body.id || req.body._id;
  const queryId = req.query.bookingId || req.query.booking_id || req.query.bookingID || req.query.p_booking_id || req.query.id || req.query._id;
  const value = paramsId || bodyId || queryId;
  return value ? String(value).trim() : '';
}

function serializeBooking(booking) {
  const data = booking?.toJSON ? booking.toJSON() : booking;
  if (!data) return data;
  return {
    ...data,
    bookingId: data.id,
    booking_id: data.id,
  };
}

async function createNotification(payload) {
  try {
    return await Notification.create(payload);
  } catch (error) {
    if (error.code === 11000 && payload.bookingId) {
      return Notification.findOneAndUpdate(
        { bookingId: payload.bookingId },
        { $set: payload },
        { new: true },
      );
    }
    return null;
  }
}

function buildBookingRequestBody(booking) {
  const count = peopleCount(booking);
  if (booking.clientName && booking.apartmentName && booking.ownerName) {
    return `${booking.clientName} requested ${booking.apartmentName} for ${count} ${count === 1 ? 'person' : 'people'} with ${booking.ownerName}.`;
  }
  if (booking.clientName && booking.apartmentName) {
    return `${booking.clientName} submitted a booking request for ${booking.apartmentName} for ${count} ${count === 1 ? 'person' : 'people'}.`;
  }
  return 'A new booking request has been submitted.';
}

function statusNotification(booking, status, changedByName) {
  const isAccepted = acceptedStatuses.has(status);
  const isCancelled = status === 'cancelled' || status === 'canceled';
  const isRejected = status === 'rejected';
  if (!isAccepted && !isCancelled && !isRejected) return null;

  const title = isAccepted ? 'Booking approved' : isCancelled ? 'Booking cancelled' : 'Booking rejected';
  const type = isAccepted ? 'booking_accepted' : isCancelled ? 'booking_cancelled' : 'booking_rejected';
  const apartmentName = booking.apartmentName?.trim();
  const managerName = changedByName?.trim() || booking.ownerName?.trim();
  let body = isAccepted ? 'Your booking request has been approved.' : isCancelled ? 'Your booking has been cancelled.' : 'Your booking request was rejected.';

  if (apartmentName && managerName) {
    body = isAccepted
      ? `${managerName} approved your booking for ${apartmentName}.`
      : isCancelled
        ? `${managerName} cancelled the booking for ${apartmentName}.`
        : `${managerName} rejected the booking request for ${apartmentName}.`;
  } else if (apartmentName) {
    body = isAccepted
      ? `Your booking for ${apartmentName} has been approved.`
      : isCancelled
        ? `Your booking for ${apartmentName} has been cancelled.`
        : `Your booking request for ${apartmentName} was rejected.`;
  }

  return { title, body, type };
}

async function adjustCapacity(booking, nextStatus) {
  const apartment = booking.apartmentId ? await Apartment.findOne({ id: booking.apartmentId }) : null;
  if (!apartment) throw new ApiError(404, 'Apartment not found for this booking');

  const previousStatus = String(booking.status || 'pending').toLowerCase().trim();
  const count = peopleCount(booking);
  const wasAccepted = acceptedStatuses.has(previousStatus);
  const willBeAccepted = acceptedStatuses.has(nextStatus);
  const willRelease = wasAccepted && terminalReleaseStatuses.has(nextStatus);

  if (!wasAccepted && willBeAccepted) {
    if ((apartment.available_people || 0) < count) {
      throw new ApiError(409, `Only ${apartment.available_people || 0} people can still rent this apartment`);
    }
    apartment.available_people -= count;
    await apartment.save();
  } else if (willRelease) {
    apartment.available_people = Math.min(apartment.max_people || count, (apartment.available_people || 0) + count);
    await apartment.save();
  }
}

const listBookings = asyncHandler(async (req, res) => {
  const filter = applyFilters({}, {
    id: req.query.id,
    clientId: req.query.clientId,
    ownerId: req.query.ownerId,
    apartmentId: req.query.apartmentId,
    status: req.query.status,
  });

  const endDateGte = req.query.endDateGte || req.query.endDate_gte || req.query.gteEndDate;
  if (endDateGte) filter.endDate = { $gte: new Date(endDateGte) };

  const bookings = await Booking.find(filter).sort(parseSort(req.query, '-createdAt'));
  return res.json(bookings.map(serializeBooking));
});

const hasActiveBookingForApartment = asyncHandler(async (req, res) => {
  const { userId, apartmentId } = req.query;
  if (!userId || !apartmentId) throw new ApiError(422, 'userId and apartmentId are required');
  const bookings = await Booking.find({
    clientId: userId,
    apartmentId,
    endDate: { $gte: new Date() },
  }).limit(20);
  const active = bookings.some((booking) => !['cancelled', 'canceled', 'rejected'].includes(String(booking.status || '').toLowerCase().trim()));
  return res.json({ active });
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ id: req.params.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  return res.json(serializeBooking(booking));
});

const createBooking = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.booking);
  delete payload.id; // Ensure server-side ID generation

  if (!payload.clientId) payload.clientId = req.user.id;
  if (!payload.clientName) payload.clientName = req.user.name;
  if (!payload.status) payload.status = 'pending';
  if (!payload.createdAt) payload.createdAt = new Date();

  if (!payload.apartmentId) throw new ApiError(422, 'apartmentId is required');

  const apartment = await Apartment.findOne({ id: payload.apartmentId });
  if (!apartment) throw new ApiError(404, 'Apartment not found');

  const existingBooking = await Booking.findOne(activeBookingFilter(payload.clientId, payload.apartmentId));
  if (existingBooking) {
    return res.status(200).json(serializeBooking(existingBooking));
  }

  payload.apartmentName = payload.apartmentName || apartment.name;
  payload.apartmentAddress = payload.apartmentAddress || apartment.address || apartment.locationAddress;
  payload.apartmentImage = payload.apartmentImage || apartment.images?.[0] || null;
  payload.ownerId = payload.ownerId || apartment.ownerId;
  payload.ownerName = payload.ownerName || apartment.ownerName;

  let booking;
  try {
    booking = await Booking.create(payload);
  } catch (error) {
    if (error.code === 11000) {
      const duplicateBooking = await Booking.findOne(activeBookingFilter(payload.clientId, payload.apartmentId));
      if (duplicateBooking) {
        return res.status(200).json(serializeBooking(duplicateBooking));
      }
    }
    throw error;
  }

  const notificationBody = buildBookingRequestBody(booking);
  
  await createNotification({
    title: 'Booking request received',
    body: notificationBody,
    createdAt: new Date(),
    type: 'new_booking',
    isRead: false,
    receiverId: booking.ownerId,
    bookingId: booking.id,
  });

  // Send FCM push notification to owner
  if (booking.ownerId) {
    try {
      const owner = await User.findOne({ id: booking.ownerId });
      if (owner?.fcmToken) {
        await sendPushToToken({
          token: owner.fcmToken,
          title: 'Booking request received',
          body: notificationBody,
          data: {
            type: 'new_booking',
            bookingId: booking.id,
            receiverId: booking.ownerId,
            senderId: booking.clientId || '',
          },
        });
      }
    } catch (error) {
      console.error('FCM push notification for new booking failed:', error.message);
    }
  }

  return res.status(201).json(serializeBooking(booking));
});

const updateStatus = asyncHandler(async (req, res) => {
  const status = normalizeStatus(req.body.status || req.body.new_status || req.body.p_status);
  const id = bookingIdFromRequest(req);
  if (!id) throw new ApiError(422, 'booking id is required');

  const booking = await Booking.findOne({ id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (![booking.clientId, booking.ownerId].includes(req.user.id) && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');
  if (['accepted', 'confirmed', 'rejected'].includes(status) && booking.ownerId !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only the owner can approve or reject this booking');
  }

  await adjustCapacity(booking, status);
  booking.status = status;
  await booking.save();

  const notification = statusNotification(booking, status, req.body.changedByName);
  if (notification && booking.clientId) {
    await createNotification({
      ...notification,
      createdAt: new Date(),
      isRead: false,
      receiverId: booking.clientId,
      bookingId: booking.id,
    });

    // Send FCM push notification to client
    try {
      const client = await User.findOne({ id: booking.clientId });
      if (client?.fcmToken) {
        await sendPushToToken({
          token: client.fcmToken,
          title: notification.title,
          body: notification.body,
          data: {
            type: notification.type,
            bookingId: booking.id,
            receiverId: booking.clientId,
            senderId: req.user.id || '',
          },
        });
      }
    } catch (error) {
      console.error('FCM push notification for booking status update failed:', error.message);
    }
  }

  return res.json(serializeBooking(booking));
});

const rateBooking = asyncHandler(async (req, res) => {
  const rating = Number(req.body.rating || req.body.p_rating);
  const id = bookingIdFromRequest(req);
  if (!id) throw new ApiError(422, 'booking id is required');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError(422, 'rating must be 1-5');

  const booking = await Booking.findOne({ id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.clientId !== req.user.id && req.user.role !== 'admin') throw new ApiError(403, 'Only the booking client can rate this apartment');
  if (!acceptedStatuses.has(String(booking.status || 'pending').toLowerCase().trim())) throw new ApiError(409, 'Only accepted bookings can be rated');

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

  return res.json(serializeBooking(booking));
});

module.exports = {
  listBookings,
  hasActiveBookingForApartment,
  getBooking,
  createBooking,
  updateStatus,
  rateBooking,
};
