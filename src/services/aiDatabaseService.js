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
  rooms,
  priceMin,
  priceMax,
  peopleCount,
  ratingPref,
  verifiedPref,
  query,
}) {
  const filter = {};
  const conditions = [];

  // Exclude test/junk apartments below 100 EGP or with single-char names
  conditions.push({ price: { $gte: 100 } });
  conditions.push({
    $and: [
      { name: { $ne: 'ب' } },
      { name: { $ne: 'ل' } },
      { name: { $ne: 'test' } },
    ],
  });

  // Location search (City, District, Address)
  if (location) {
    const locationRegex = searchRegex(location);
    if (locationRegex) {
      conditions.push({
        $or: [
          { city: locationRegex },
          { district: locationRegex },
          { address: locationRegex },
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
        ],
      });
    }
  }

  // People capacity / Number of people search
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

  // Price range matching (Budget)
  const priceFilter = {};
  if (priceMin) {
    priceFilter.$gte = Number(priceMin);
  }
  if (priceMax) {
    priceFilter.$lte = Number(priceMax);
  }
  if (Object.keys(priceFilter).length > 0) {
    conditions.push({ price: priceFilter });
  }

  // Verified preference
  if (verifiedPref) {
    conditions.push({ verified: true });
  }

  // Free-text query (Features like furnished, near university, etc.)
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

    // If no exact matches exist, get closest available apartments as fallback
    if (apartments.length === 0) {
      const fallbackFilter = { price: { $gte: 100 } };
      
      // If location was requested, try fallback to just location
      if (location) {
        const locationRegex = searchRegex(location);
        if (locationRegex) {
          fallbackFilter.$or = [
            { city: locationRegex },
            { district: locationRegex },
            { address: locationRegex },
          ];
        }
      }
      apartments = await Apartment.find(fallbackFilter).limit(10).lean();
    }

    // Smart semantic-style ranking & scoring
    const scoredApartments = apartments.map((apt) => {
      let score = 0;

      // 1. Availability preference (Crucial)
      const isAvailable = apt.available_people > 0;
      if (isAvailable) score += 200;

      // 2. Verified preference (Trustworthiness)
      if (apt.verified) score += 100;

      // 3. Rating score (Popularity)
      if (apt.rating_average) score += apt.rating_average * 20;

      // 4. Exact location match score
      if (location) {
        const normLoc = normalizeArabicText(location);
        const normCity = normalizeArabicText(apt.city);
        const normDistrict = normalizeArabicText(apt.district);
        const normAddress = normalizeArabicText(apt.address || apt.locationAddress);

        if (normCity.includes(normLoc) || normDistrict.includes(normLoc)) {
          score += 150;
        } else if (normAddress.includes(normLoc)) {
          score += 100;
        }
      }

      // 5. Price suitability score
      if (priceMax) {
        const diff = Number(priceMax) - (apt.price || 0);
        if (diff >= 0) {
          // Cheaper than max price gets bonus
          score += 50;
          score += (1 - (diff / Number(priceMax))) * 30;
        }
      }

      if (priceMin) {
        if (apt.price >= Number(priceMin)) {
          score += 50;
        }
      }

      // 6. Rating preference bonus
      if (ratingPref && apt.rating_average >= 4.0) {
        score += 80;
      }

      // 7. Freshness bonus
      if (apt.createdAt) {
        const weeksOld = (Date.now() - new Date(apt.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7);
        if (weeksOld < 4) score += 20;
      }

      return { apt, score };
    });

    // Sort by best matches first
    scoredApartments.sort((a, b) => b.score - a.score);

    // Limit to top 10 results
    const results = scoredApartments.slice(0, 10).map(x => x.apt);

    return results.map(formatApartmentForResponse);
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
