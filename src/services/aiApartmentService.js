/**
 * Apartment Service for AI Chatbot
 */

const db = require('./aiDatabaseService');

async function searchApartments(filters) {
  return db.searchApartments({
    location: filters?.district || filters?.location || null,
    locationVariants: filters?.districtVariants || filters?.locationVariants || [],
    rooms: filters?.rooms || filters?.bedrooms || null,
    priceMin: filters?.minPrice ?? filters?.priceMin ?? null,
    priceMax: filters?.maxPrice ?? filters?.priceMax ?? null,
    priceOperator: filters?.priceOperator || null,
    peopleCount: filters?.peopleCount || null,
    ratingPref: filters?.ratingPref || false,
    verifiedPref: filters?.verifiedPref || false,
    query: filters?.query || null,
  });
}

async function getFeaturedApartments() {
  return db.getTopRatedApartments({ limit: 5 });
}

async function getBudgetApartments() {
  return db.getCheapestApartments({ limit: 5 });
}

async function getAvailableApartments() {
  return db.getAvailableApartments({ limit: 10 });
}

module.exports = {
  searchApartments,
  getFeaturedApartments,
  getBudgetApartments,
  getAvailableApartments,
};
