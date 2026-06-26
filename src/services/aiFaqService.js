/**
 * FAQ Service for AI Chatbot
 */

const db = require('./aiDatabaseService');

async function getFaqAnswer(message, intent) {
  const isArabic = /[\u0600-\u06ff]/.test(message);
  const stats = await db.getPlatformStats();

  if (!stats) {
    return {
      question: message,
      answer: isArabic
        ? 'معلومات المنصة غير متاحة حالياً. جرب تاني بعد شوية.'
        : 'Platform information is temporarily unavailable. Please try again shortly.',
      context: null,
    };
  }

  const context = buildDatabaseContext(stats, isArabic);

  return {
    question: message,
    answer: context,
    stats,
  };
}

function buildDatabaseContext(stats, isArabic) {
  if (isArabic) {
    const parts = [
      `المنصة فيها ${stats.totalApartments} شقة متاحة للعرض`,
      stats.availableApartments > 0
        ? `${stats.availableApartments} منهم متاحين للحجز دلوقتي`
        : null,
      stats.priceRange
        ? `الأسعار بتتراوح من ${stats.priceRange.min} لـ ${stats.priceRange.max} جنيه، ومتوسط السعر ${stats.priceRange.average} جنيه`
        : null,
      stats.cities.length > 0
        ? `الشقق موجودة في: ${stats.cities.join('، ')}`
        : null,
      stats.totalOwners > 0
        ? `${stats.totalOwners} مالك مسجل على المنصة`
        : null,
    ];

    return parts.filter(Boolean).join('. ') + '.';
  }

  const parts = [
    `The platform has ${stats.totalApartments} apartments listed`,
    stats.availableApartments > 0
      ? `${stats.availableApartments} are currently available for booking`
      : null,
    stats.priceRange
      ? `Prices range from ${stats.priceRange.min} to ${stats.priceRange.max} EGP, with an average of ${stats.priceRange.average} EGP`
      : null,
    stats.cities.length > 0
      ? `Apartments are located in: ${stats.cities.join(', ')}`
      : null,
    stats.totalOwners > 0
      ? `${stats.totalOwners} property owners are registered on the platform`
      : null,
  ];

  return parts.filter(Boolean).join('. ') + '.';
}

module.exports = {
  getFaqAnswer,
};
