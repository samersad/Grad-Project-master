/**
 * Intelligent Database Retrieval Service for SOKON AI Chatbot
 *
 * Runs inside the main backend and queries MongoDB collections directly.
 */

const Apartment = require('../models/apartment.model');
const Booking = require('../models/booking.model');
const User = require('../models/user.model');

/**
 * Escape special regex characters in a user-provided string.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a case-insensitive regex for searching text fields.
 */
function searchRegex(text) {
  if (!text || typeof text !== 'string') return null;
  return new RegExp(escapeRegExp(text.trim()), 'i');
}

/**
 * Search apartments in MongoDB based on extracted entities and user message.
 */
async function searchApartments({ location, rooms, price, query }) {
  const filter = {};
  const conditions = [];

  // Location search
  if (location) {
    const locationRegex = searchRegex(location);
    if (locationRegex) {
      conditions.push({
        $or: [
          { city: locationRegex },
          { district: locationRegex },
          { address: locationRegex },
          { location: locationRegex },
          { locationAddress: locationRegex },
        ],
      });
    }
  }

  // Room count search
  if (rooms) {
    const roomCount = Number(rooms);
    if (Number.isFinite(roomCount) && roomCount > 0) {
      conditions.push({
        $or: [
          { bedrooms: roomCount },
          { rooms: roomCount },
        ],
      });
    }
  }

  // Price match
  if (price) {
    const maxPrice = Number(price);
    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      const minPrice = Math.floor(maxPrice * 0.5);
      conditions.push({ price: { $gte: minPrice, $lte: maxPrice } });
    }
  }

  // Exclude test/junk apartments below 100 EGP
  conditions.push({ price: { $gte: 100 } });

  // Free-text query
  if (query) {
    const queryRegex = searchRegex(query);
    if (queryRegex) {
      conditions.push({
        $or: [
          { name: queryRegex },
          { title: queryRegex },
          { description: queryRegex },
          { address: queryRegex },
          { location: queryRegex },
          { locationAddress: queryRegex },
          { city: queryRegex },
          { district: queryRegex },
          { ownerName: queryRegex },
        ],
      });
    }
  }

  // Show available only
  conditions.push({
    $or: [
      { available_people: { $gt: 0 } },
      { available: true },
      { available_people: { $exists: false }, available: { $ne: false } },
    ],
  });

  if (conditions.length > 0) {
    filter.$and = conditions;
  }

  const sortOrder = price ? { price: -1, createdAt: -1 } : { rating_average: -1, createdAt: -1 };

  try {
    const apartments = await Apartment.find(filter)
      .sort(sortOrder)
      .limit(10)
      .lean();

    return apartments.map(formatApartmentForResponse);
  } catch (error) {
    console.error('Database apartment search failed:', error.message);
    return [];
  }
}

/**
 * Get all available apartments.
 */
async function getAvailableApartments({ limit = 5 } = {}) {
  try {
    const apartments = await Apartment.find({
      $or: [
        { available_people: { $gt: 0 } },
        { available: true },
        { available_people: { $exists: false }, available: { $ne: false } },
      ],
      price: { $gte: 100 },
    })
      .sort({ rating_average: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return apartments.map(formatApartmentForResponse);
  } catch (error) {
    console.error('Database available apartments query failed:', error.message);
    return [];
  }
}

/**
 * Get the top-rated apartments.
 */
async function getTopRatedApartments({ limit = 5 } = {}) {
  try {
    const apartments = await Apartment.find({
      $or: [
        { available_people: { $gt: 0 } },
        { available: true },
        { available_people: { $exists: false }, available: { $ne: false } },
      ],
      price: { $gte: 100 },
      rating_count: { $gt: 0 },
    })
      .sort({ rating_average: -1 })
      .limit(limit)
      .lean();

    return apartments.map(formatApartmentForResponse);
  } catch (error) {
    console.error('Database top-rated query failed:', error.message);
    return [];
  }
}

/**
 * Get the cheapest available apartments.
 */
async function getCheapestApartments({ limit = 5 } = {}) {
  try {
    const apartments = await Apartment.find({
      $or: [
        { available_people: { $gt: 0 } },
        { available: true },
        { available_people: { $exists: false }, available: { $ne: false } },
      ],
      price: { $gt: 0 },
    })
      .sort({ price: 1 })
      .limit(limit)
      .lean();

    return apartments.map(formatApartmentForResponse);
  } catch (error) {
    console.error('Database cheapest apartments query failed:', error.message);
    return [];
  }
}

/**
 * Get a specific apartment by ID.
 */
async function getApartmentById(apartmentId) {
  try {
    const apartment = await Apartment.findOne({ id: apartmentId }).lean();
    return apartment ? formatApartmentForResponse(apartment) : null;
  } catch (error) {
    console.error('Database apartment by ID query failed:', error.message);
    return null;
  }
}

/**
 * Get platform statistics from the real database.
 */
async function getPlatformStats() {
  try {
    const [totalApartments, availableApartments, totalBookings, activeBookings, totalUsers, totalOwners] =
      await Promise.all([
        Apartment.countDocuments(),
        Apartment.countDocuments({ available_people: { $gt: 0 } }),
        Booking.countDocuments(),
        Booking.countDocuments({
          status: { $in: ['pending', 'accepted', 'confirmed'] },
          endDate: { $gte: new Date() },
        }),
        User.countDocuments(),
        User.countDocuments({ role: 'owner' }),
      ]);

    const priceStats = await Apartment.aggregate([
      { $match: { price: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
        },
      },
    ]);

    const cities = await Apartment.distinct('city', { city: { $ne: null } });
    const districts = await Apartment.distinct('district', { district: { $ne: null } });

    return {
      totalApartments,
      availableApartments,
      totalBookings,
      activeBookings,
      totalUsers,
      totalOwners,
      priceRange: priceStats[0]
        ? {
            average: Math.round(priceStats[0].avgPrice),
            min: priceStats[0].minPrice,
            max: priceStats[0].maxPrice,
          }
        : null,
      cities: cities.filter(Boolean),
      districts: districts.filter(Boolean),
    };
  } catch (error) {
    console.error('Database platform stats query failed:', error.message);
    return null;
  }
}

/**
 * Get booking information for a specific user.
 */
async function getUserBookings(userId) {
  try {
    const bookings = await Booking.find({ clientId: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return bookings.map(formatBookingForResponse);
  } catch (error) {
    console.error('Database user bookings query failed:', error.message);
    return [];
  }
}

/**
 * Get booking information for a specific apartment.
 */
async function getApartmentBookingStatus(apartmentId) {
  try {
    const apartment = await Apartment.findOne({ id: apartmentId }).lean();
    if (!apartment) return null;

    const activeBookings = await Booking.countDocuments({
      apartmentId,
      status: { $in: ['accepted', 'confirmed'] },
      endDate: { $gte: new Date() },
    });

    return {
      apartment: formatApartmentForResponse(apartment),
      activeBookings,
      availableSpots: apartment.available_people || 0,
      maxCapacity: apartment.max_people || 1,
    };
  } catch (error) {
    console.error('Database apartment booking status query failed:', error.message);
    return null;
  }
}

/**
 * Search the database intelligently based on a raw user query.
 */
async function intelligentSearch(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return { apartments: [] };

  const regex = searchRegex(rawQuery);
  if (!regex) return { apartments: [] };

  try {
    const apartments = await Apartment.find({
      $or: [
        { name: regex },
        { description: regex },
        { address: regex },
        { locationAddress: regex },
        { city: regex },
        { district: regex },
        { ownerName: regex },
      ],
    })
      .sort({ rating_average: -1, createdAt: -1 })
      .limit(10)
      .lean();

    return {
      apartments: apartments.map(formatApartmentForResponse),
    };
  } catch (error) {
    console.error('Intelligent search failed:', error.message);
    return { apartments: [] };
  }
}

/**
 * Get owner information (non-sensitive fields only).
 */
async function getOwnerInfo(ownerId) {
  try {
    const owner = await User.findOne({ id: ownerId }).lean();
    if (!owner) return null;

    return {
      name: owner.name,
      college: owner.college,
      photoUrl: owner.photoUrl,
    };
  } catch (error) {
    console.error('Database owner info query failed:', error.message);
    return null;
  }
}

/**
 * Format an apartment document for the chatbot response.
 * Maps database fields to user-friendly response format.
 */
function formatApartmentForResponse(doc) {
  const idVal = doc.id || doc.apartmentId || (doc._id ? doc._id.toString() : '');
  const nameVal = doc.name || doc.title || 'Unnamed Apartment';
  const bedroomsVal = doc.bedrooms != null ? doc.bedrooms : (doc.rooms || null);
  const availablePeopleVal = doc.available_people != null
    ? doc.available_people
    : (doc.available === true ? 1 : (doc.available === false ? 0 : 1));
  const cityVal = doc.city || doc.location || 'Assuit';
  const districtVal = doc.district || null;

  return {
    id: idVal,
    name: nameVal,
    description: doc.description || '',
    price: doc.price || 0,
    images: doc.images || [],
    video_url: doc.videoUrl || doc.video_url || null,
    bedrooms: bedroomsVal,
    bathrooms: doc.bathrooms || null,
    living_rooms: doc.living_rooms || doc.livingRooms || null,
    floor: doc.floor || 1,
    max_people: doc.max_people || doc.maxPeople || 1,
    available_people: availablePeopleVal,
    address: doc.address || doc.location || null,
    city: cityVal,
    district: districtVal,
    locationAddress: doc.locationAddress || doc.address || doc.location || null,
    lat: doc.lat || null,
    lng: doc.lng || null,
    ownerId: doc.ownerId || null,
    ownerName: doc.ownerName || null,
    ownerPhotoUrl: doc.ownerPhotoUrl || null,
    verified: doc.verified || false,
    rating_sum: doc.rating_sum || 0,
    rating_count: doc.rating_count || 0,
    rating_average: doc.rating_average || 0,
    createdAt: doc.createdAt || null,

    // Backward-compatible aliases for the React web frontend and chatController
    title: nameVal,
    rooms: bedroomsVal,
    location: [districtVal, cityVal].filter(Boolean).join(', ') || 'Egypt',
    available: availablePeopleVal > 0,
    availablePeople: availablePeopleVal,
    rating: doc.rating_average || 0,
  };
}

/**
 * Format a booking document for the chatbot response.
 */
function formatBookingForResponse(doc) {
  return {
    id: doc.id,
    apartmentName: doc.apartmentName,
    apartmentAddress: doc.apartmentAddress,
    clientName: doc.clientName,
    ownerName: doc.ownerName,
    startDate: doc.startDate,
    endDate: doc.endDate,
    totalPrice: doc.totalPrice,
    peopleCount: doc.people_count,
    status: doc.status,
    rating: doc.rating,
  };
}

module.exports = {
  searchApartments,
  getAvailableApartments,
  getTopRatedApartments,
  getCheapestApartments,
  getApartmentById,
  getPlatformStats,
  getUserBookings,
  getApartmentBookingStatus,
  intelligentSearch,
  getOwnerInfo,
};
