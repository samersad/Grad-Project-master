/**
 * Apartment Service for AI Chatbot
 */

const db = require('./aiDatabaseService');

async function searchApartments(entities) {
  return db.searchApartments({
    location: entities.location || null,
    rooms: entities.rooms || null,
    price: entities.price || null,
    query: entities.query || null,
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
