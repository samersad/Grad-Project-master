const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Apartment = require('../models/apartment.model');
const { sanitizePayload, fields, applyFilters, parseSort } = require('../utils/supabaseShape');

const listApartments = asyncHandler(async (req, res) => {
  const filter = applyFilters({}, {
    id: req.query.id,
    ownerId: req.query.ownerId,
    city: req.query.city,
    district: req.query.district,
    verified: req.query.verified === undefined ? undefined : req.query.verified === true || req.query.verified === 'true',
  });
  const apartments = await Apartment.find(filter).sort(parseSort(req.query, '-createdAt'));
  return res.json(apartments);
});

const getApartment = asyncHandler(async (req, res) => {
  const apartment = await Apartment.findOne({ id: req.params.id });
  if (!apartment) throw new ApiError(404, 'Apartment not found');
  return res.json(apartment);
});

const createApartment = asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body, fields.apartment);
  if (!payload.ownerId) payload.ownerId = req.user.id;
  if (!payload.ownerName) payload.ownerName = req.user.name;
  if (!payload.ownerPhotoUrl) payload.ownerPhotoUrl = req.user.photoUrl;

  const apartment = await Apartment.create(payload);
  return res.status(201).json(apartment);
});

const updateApartment = asyncHandler(async (req, res) => {
  const apartment = await Apartment.findOne({ id: req.params.id });
  if (!apartment) throw new ApiError(404, 'Apartment not found');
  if (apartment.ownerId && apartment.ownerId !== req.user.id && req.user.role !== 'admin') throw new ApiError(403, 'Forbidden');

  const payload = sanitizePayload(req.body, fields.apartment);
  delete payload.id;
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

module.exports = {
  listApartments,
  getApartment,
  createApartment,
  updateApartment,
  deleteApartment,
};

