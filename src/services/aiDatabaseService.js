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
 * Clean up text (remove Arabic diacritics/variations for flexible match).
 */
function normalizeArabicText(str) {
  if (!str) return '';
  return str
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652]/g, '')
    .toLowerCase();
}

/**
 * Search apartments in MongoDB based on extracted entities and user message.
 */
async function searchApartments({
  location,
  locationVariants = [],
  rooms,
  priceMin,
  priceMax,
  priceOperator,
  peopleCount,
  ratingPref,
  verifiedPref,
  query,
}) {
  const filter = {};
  const conditions = [];
  const searchFilters = {
    location,
    locationVariants,
    rooms,
    priceMin,
    priceMax,
    priceOperator,
    peopleCount,
    ratingPref,
    verifiedPref,
    query,
  };

  conditions.push({ price: { $gte: 100 } });
  conditions.push({
    $and: [
      { name: { $ne: 'ب' } },
      { name: { $ne: 'ل' } },
      { name: { $ne: 'test' } },
    ],
  });

  const effectiveLocations = [...new Set([location, ...locationVariants].filter(Boolean))];
  if (effectiveLocations.length > 0) {
    const locationRegexes = effectiveLocations.map(searchRegex).filter(Boolean);
    if (locationRegexes.length > 0) {
      conditions.push({
        $or: locationRegexes.flatMap((locationRegex) => [
          { city: locationRegex },
          { district: locationRegex },
          { address: locationRegex },
          { locationAddress: locationRegex },
        ]),
      });
    }
  }

  if (rooms) {
    const roomCount = Number(rooms);
    if (Number.isFinite(roomCount) && roomCount > 0) {
      conditions.push({ $or: [{ bedrooms: roomCount }] });
    }
  }

  if (peopleCount) {
    const cap = Number(peopleCount);
    if (Number.isFinite(cap) && cap > 0) {
      conditions.push({
        $or: [
          { max_people: { $gte: cap } },
          { available_people: { $gte: cap } },
        ],
      });
    }
  }

  const priceFilter = {};
  if (priceMin != null) {
    priceFilter[priceOperator === 'gt' ? '$gt' : '$gte'] = Number(priceMin);
  }
  if (priceMax != null) {
    priceFilter[priceOperator === 'lt' ? '$lt' : '$lte'] = Number(priceMax);
  }
  if (Object.keys(priceFilter).length > 0) {
    conditions.push({ price: priceFilter });
  }

  if (verifiedPref) {
    conditions.push({ verified: true });
  }

  if (query) {
    const queryRegex = searchRegex(query);
    if (queryRegex) {
      conditions.push({
        $or: [
          { name: queryRegex },
          { description: queryRegex },
          { address: queryRegex },
          { locationAddress: queryRegex },
        ],
      });
    }
  }

  if (conditions.length > 0) {
    filter.$and = conditions;
  }

  try {
    let apartments = await Apartment.find(filter).lean();

    if (apartments.length === 0 && (priceMin != null || priceMax != null)) {
      return { apartments: [], isFallback: false, mongoFilter: filter, searchFilters };
    }

    let isFallback = false;
    if (apartments.length === 0) {
      isFallback = true;
      const fallbackFilter = { price: { $gte: 100 } };
      if (effectiveLocations.length > 0) {
        const locationRegexes = effectiveLocations.map(searchRegex).filter(Boolean);
        if (locationRegexes.length > 0) {
          fallbackFilter.$or = locationRegexes.flatMap((locationRegex) => [
            { city: locationRegex },
            { district: locationRegex },
            { address: locationRegex },
          ]);
        }
      }
      apartments = await Apartment.find(fallbackFilter).limit(10).lean();
    }

    const scoredApartments = apartments.map((apt) => {
      let score = 0;

      if ((apt.available_people || 0) > 0) score += 200;
      if (apt.verified) score += 100;
      if (apt.rating_average) score += apt.rating_average * 20;

      if (effectiveLocations.length > 0) {
        const normCity = normalizeArabicText(apt.city);
        const normDistrict = normalizeArabicText(apt.district);
        const normAddress = normalizeArabicText(apt.address || apt.locationAddress);
        const locationMatched = effectiveLocations.some((candidate) => {
          const normLoc = normalizeArabicText(candidate);
          return normCity.includes(normLoc) || normDistrict.includes(normLoc);
        });
        const addressMatched = effectiveLocations.some((candidate) => {
          const normLoc = normalizeArabicText(candidate);
          return normAddress.includes(normLoc);
        });

        if (locationMatched) {
          score += 150;
        } else if (addressMatched) {
          score += 100;
        }
      }

      if (priceMax != null) {
        const diff = Number(priceMax) - (apt.price || 0);
        if (diff >= 0) {
          score += 100;
          if (Number(priceMax) > 0) {
            score += (1 - diff / Number(priceMax)) * 30;
          }
        }
      }

      if (priceMin != null && apt.price >= Number(priceMin)) {
        score += 50;
      }

      if (ratingPref && apt.rating_average >= 4.0) {
        score += 80;
      }

      return { apt, score };
    });

    scoredApartments.sort((a, b) => b.score - a.score);
    const results = scoredApartments.slice(0, 10).map((item) => item.apt);

    return {
      apartments: results.map(formatApartmentForResponse),
      isFallback,
      mongoFilter: filter,
      searchFilters,
    };
  } catch (error) {
    console.error('Database apartment search failed:', error.message);
    return { apartments: [], isFallback: false, mongoFilter: filter, searchFilters };
  }
}

/**
 * Get all available apartments.
 */
async function getAvailableApartments({ limit = 5 } = {}) {
  try {
    const apartments = await Apartment.find({
      available_people: { $gt: 0 },
      price: { $gte: 100 },
      name: { $nin: ['ب', 'ل', 'test'] },
    })
      .sort({ verified: -1, rating_average: -1, createdAt: -1 })
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
      available_people: { $gt: 0 },
      price: { $gte: 100 },
      rating_count: { $gt: 0 },
      name: { $nin: ['ب', 'ل', 'test'] },
    })
      .sort({ rating_average: -1, verified: -1 })
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
      available_people: { $gt: 0 },
      price: { $gte: 100 },
      name: { $nin: ['ب', 'ل', 'test'] },
    })
      .sort({ price: 1, rating_average: -1 })
      .limit(limit)
      .lean();

    return apartments.map(formatApartmentForResponse);
  } catch (error) {
    console.error('Database cheapest apartments query failed:', error.message);
    return [];
  }
}

/**
 * Get platform statistics from the real database.
 */
async function getPlatformStats() {
  try {
    const [totalApartments, availableApartments, totalBookings, activeBookings, totalUsers, totalOwners] =
      await Promise.all([
        Apartment.countDocuments({ price: { $gte: 100 }, name: { $nin: ['ب', 'ل', 'test'] } }),
        Apartment.countDocuments({ available_people: { $gt: 0 }, price: { $gte: 100 }, name: { $nin: ['ب', 'ل', 'test'] } }),
        Booking.countDocuments(),
        Booking.countDocuments({
          status: { $in: ['pending', 'accepted', 'confirmed'] },
          endDate: { $gte: new Date() },
        }),
        User.countDocuments(),
        User.countDocuments({ role: 'owner' }),
      ]);

    const priceStats = await Apartment.aggregate([
      { $match: { price: { $gte: 100 }, name: { $nin: ['ب', 'ل', 'test'] } } },
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
        },
      },
    ]);

    const cities = await Apartment.distinct('city', { city: { $ne: null }, price: { $gte: 100 } });
    const districts = await Apartment.distinct('district', { district: { $ne: null }, price: { $gte: 100 } });

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
 * Format an apartment document for the chatbot response.
 * Support BOTH snake_case and camelCase properties for absolute compatibility.
 * Matches D:\sokon\lib\core\model\ApartmentResponse.dart exactly.
 */
function formatApartmentForResponse(doc) {
  const idVal = doc.id || doc.apartmentId || (doc._id ? doc._id.toString() : '');
  const nameVal = doc.name || doc.title || 'Unnamed Apartment';
  const bedroomsVal = doc.bedrooms != null ? doc.bedrooms : 0;
  const bathroomsVal = doc.bathrooms != null ? doc.bathrooms : 0;
  const livingRoomsVal = doc.living_rooms != null ? doc.living_rooms : 0;
  const floorVal = doc.floor != null ? doc.floor : 1;
  const maxPeopleVal = doc.max_people != null ? doc.max_people : 1;
  const availablePeopleVal = doc.available_people != null ? doc.available_people : 0;

  const cityVal = doc.city || 'Assuit';
  const districtVal = doc.district || '';

  return {
    id: idVal,
    name: nameVal,
    description: doc.description || '',
    price: doc.price || 0,
    images: Array.isArray(doc.images) ? doc.images.filter(Boolean) : [],

    // snake_case (Expected by ApartmentResponse.fromJson in Flutter)
    video_url: doc.video_url || doc.videoUrl || '',
    living_rooms: livingRoomsVal,
    max_people: maxPeopleVal,
    available_people: availablePeopleVal,
    rating_sum: doc.rating_sum || 0,
    rating_count: doc.rating_count || 0,
    rating_average: doc.rating_average || 0,

    // camelCase (Expected by user instructions and some UI parts)
    videoUrl: doc.video_url || doc.videoUrl || '',
    bedrooms: bedroomsVal,
    bathrooms: bathroomsVal,
    livingRooms: livingRoomsVal,
    floor: floorVal,
    maxPeople: maxPeopleVal,
    availablePeople: availablePeopleVal,
    address: doc.address || '',
    city: cityVal,
    district: districtVal,
    locationAddress: doc.locationAddress || doc.address || '',
    lat: doc.lat || 0,
    lng: doc.lng || 0,
    ownerId: doc.ownerId || '',
    ownerName: doc.ownerName || '',
    ownerPhotoUrl: doc.ownerPhotoUrl || '',
    verified: doc.verified || false,
    ratingSum: doc.rating_sum || 0,
    ratingCount: doc.rating_count || 0,
    ratingAverage: doc.rating_average || 0,
    createdAt: doc.createdAt || null,

    // Aliases
    title: nameVal,
    rooms: bedroomsVal,
    available: availablePeopleVal > 0,
    rating: doc.rating_average || 0,
  };
}

module.exports = {
  searchApartments,
  getAvailableApartments,
  getTopRatedApartments,
  getCheapestApartments,
  getPlatformStats,
};
