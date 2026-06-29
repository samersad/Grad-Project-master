const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Apartment = require('../models/apartment.model');
const Booking = require('../models/booking.model');
const { sanitizePayload, fields, applyFilters, parseSort } = require('../utils/supabaseShape');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const activeAcceptedStatuses = ['accepted', 'confirmed'];

function peopleCount(booking) {
  return Math.max(Number(booking.people_count || 1), 1);
}

async function refreshApartmentAvailability(apartment) {
  if (!apartment) return apartment;

  const bookings = await Booking.find({
    apartmentId: apartment.id,
    status: { $in: activeAcceptedStatuses },
    $or: [
      { endDate: null },
      { endDate: { $gte: new Date() } },
    ],
  });

  const maxPeople = Math.max(Number(apartment.max_people || 0), 0);
  const occupiedPeople = bookings.reduce((sum, booking) => sum + peopleCount(booking), 0);
  const availablePeople = Math.max(maxPeople - occupiedPeople, 0);

  if (Number(apartment.available_people || 0) !== availablePeople) {
    apartment.available_people = availablePeople;
    await Apartment.updateOne(
      { id: apartment.id },
      { $set: { available_people: availablePeople } },
    );
  }

  return apartment;
}

const listApartments = asyncHandler(async (req, res) => {
  const filter = applyFilters({}, {
    id: req.query.id,
    ownerId: req.query.ownerId,
    city: req.query.city,
    district: req.query.district,
    verified: req.query.verified === undefined ? undefined : req.query.verified === true || req.query.verified === 'true',
  });
  const apartments = await Apartment.find(filter).sort(parseSort(req.query, '-createdAt'));
  await Promise.all(apartments.map(refreshApartmentAvailability));
  return res.json(apartments);
});

const searchApartments = asyncHandler(async (req, res) => {
  const query = String(req.query.query || req.query.q || '').trim();
  if (!query) return res.json([]);

  const searchRegex = new RegExp(escapeRegExp(query), 'i');
  const filter = {
    $or: [
      { name: searchRegex },
      { description: searchRegex },
      { address: searchRegex },
      { locationAddress: searchRegex },
    ],
  };

  const apartments = await Apartment.find(filter).sort(parseSort(req.query, '-createdAt'));
  await Promise.all(apartments.map(refreshApartmentAvailability));
  return res.json(apartments);
});
const getApartment = asyncHandler(async (req, res) => {
  const apartment = await Apartment.findOne({ id: req.params.id });
  if (!apartment) throw new ApiError(404, 'Apartment not found');
  await refreshApartmentAvailability(apartment);
  return res.json(apartment);
});

const createApartment = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.apartment);
  delete payload.id; // Ensure server-side ID generation

  if (!payload.ownerId) payload.ownerId = req.user.id;
  if (!payload.ownerName) payload.ownerName = req.user.name;
  if (!payload.ownerPhotoUrl) payload.ownerPhotoUrl = req.user.photoUrl;
  payload.verified = false;

  const apartment = await Apartment.create(payload);
  return res.status(201).json(apartment);
});

const updateApartment = asyncHandler(async (req, res) => {
  const apartment = await Apartment.findOne({ id: req.params.id });
  if (!apartment) throw new ApiError(404, 'Apartment not found');
  if (apartment.ownerId && apartment.ownerId !== req.user.id && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');

  const payload = sanitizePayload(req.body, fields.apartment);
  delete payload.id;
  delete payload.verified;
  Object.assign(apartment, payload);
  await apartment.save();
  return res.json(apartment);
});

const deleteApartment = asyncHandler(async (req, res) => {
  const apartment = await Apartment.findOne({ id: req.params.id });
  if (!apartment) throw new ApiError(404, 'Apartment not found');
  if (apartment.ownerId && apartment.ownerId !== req.user.id && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');
  await apartment.deleteOne();
  return res.json([apartment]);
});

const setApartmentVerification = asyncHandler(async (req, res) => {
  const apartment = await Apartment.findOne({ id: req.params.id });
  if (!apartment) throw new ApiError(404, 'Apartment not found');

  const rawVerified = req.body?.verified;
  const verified =
    typeof rawVerified === 'boolean'
      ? rawVerified
      : rawVerified === 'true'
        ? true
        : rawVerified === 'false'
          ? false
          : !apartment.verified;

  apartment.verified = verified;
  await apartment.save();
  return res.json(apartment);
});

module.exports = {
  listApartments,
  searchApartments,
  getApartment,
  createApartment,
  updateApartment,
  deleteApartment,
  setApartmentVerification,
};
