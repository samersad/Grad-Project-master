/**
 * Chatbot Controller — Database-Driven AI Responses
 */

const { generateChatResponse } = require('../services/aiOpenaiService');
const { detectIntentAndEntities, isArabicMessage } = require('../services/aiIntentService');
const { searchApartments } = require('../services/aiApartmentService');
const { getFaqAnswer } = require('../services/aiFaqService');
const db = require('../services/aiDatabaseService');

async function handleChat(req, res, next) {
  try {
    const { message } = req.body;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string',
      });
    }

    if (message.length > 1000) {
      return res.status(413).json({
        success: false,
        error: 'Message is too long. Maximum length is 1000 characters.',
      });
    }

    const cleanMessage = message.trim();
    const language = isArabicMessage(cleanMessage) ? 'ar' : 'en';
    const analysis = await detectIntentAndEntities(cleanMessage);
    const { intent, entities } = analysis;

    let data = null;
    let answerContext = '';

    // search_apartment
    if (intent === 'search_apartment') {
      const apartments = await searchApartments(entities);
      data = apartments;
      answerContext = buildApartmentContext(apartments, entities, language);
    }

    // booking_info
    if (intent === 'booking_info') {
      const stats = await db.getPlatformStats();
      data = {
        totalBookings: stats?.totalBookings || 0,
        activeBookings: stats?.activeBookings || 0,
      };
      answerContext = buildBookingContext(stats, language);
    }

    // platform_info
    if (intent === 'platform_info') {
      const faqResult = await getFaqAnswer(cleanMessage, intent);
      data = faqResult.stats || null;
      answerContext = faqResult.answer;
    }

    // contact_support
    if (intent === 'contact_support') {
      data = {
        supportEmail: 'support@sokon3m.com',
        supportPhone: '01011105307',
        availableHours:
          language === 'ar'
            ? 'من الأحد إلى الجمعة، من 9 صباحا إلى 6 مساء'
            : 'Sunday to Friday, 9:00 AM - 6:00 PM',
      };
      answerContext =
        language === 'ar'
          ? 'المستخدم عايز يتواصل مع خدمة العملاء. وضح بيانات التواصل: support@sokon3m.com أو 01011105307'
          : 'The user wants to contact support. Share the support details: support@sokon3m.com or 01011105307';
    }

    // general
    if (intent === 'general') {
      const stats = await db.getPlatformStats();
      if (stats) {
        data = {
          availableApartments: stats.availableApartments,
          cities: stats.cities,
        };
        answerContext =
          language === 'ar'
            ? `المنصة فيها ${stats.availableApartments} شقة متاحة${stats.cities.length > 0 ? ` في ${stats.cities.join('، ')}` : ''}. اعرض المساعدة في البحث عن شقة أو الحجز أو الدعم.`
            : `The platform has ${stats.availableApartments} available apartments${stats.cities.length > 0 ? ` in ${stats.cities.join(', ')}` : ''}. Offer help with apartment search, booking, or support.`;
      } else {
        answerContext =
          language === 'ar'
            ? 'رد بتحية ودودة واعرض المساعدة في البحث عن شقة أو الحجز أو الدعم.'
            : 'Reply with a friendly greeting and offer help with apartment search, booking, or support.';
      }
    }

    // Generate response using OpenAI
    const reply = await generateChatResponse({
      userMessage: cleanMessage,
      intent,
      entities,
      answerContext,
      language: intent === 'contact_support' ? 'ar' : language,
    });

    return res.json({
      success: true,
      intent,
      entities,
      language,
      reply,
      data,
    });
  } catch (error) {
    next(error);
  }
}

function buildApartmentContext(apartments, entities, language) {
  if (!apartments || apartments.length === 0) {
    return language === 'ar'
      ? 'لم يتم العثور على شقق مطابقة. اقترح تغيير المكان أو عدد الغرف أو الميزانية.'
      : 'No matching apartments were found. Suggest changing the location, room count, or budget.';
  }

  const criteria = [
    entities.location ? `location: ${entities.location}` : null,
    entities.rooms ? `bedrooms: ${entities.rooms}` : null,
    entities.price ? `maximum price: ${entities.price} EGP` : null,
    entities.query ? `features: ${entities.query}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const listings = apartments
    .map((apt) => {
      const parts = [
        apt.name,
        apt.city ? `City: ${apt.city}` : null,
        apt.district ? `District: ${apt.district}` : null,
        apt.address ? `Address: ${apt.address}` : null,
        apt.bedrooms != null ? `${apt.bedrooms} bedroom(s)` : null,
        apt.bathrooms != null ? `${apt.bathrooms} bathroom(s)` : null,
        apt.price != null ? `${apt.price} EGP/month` : null,
        apt.availablePeople != null ? `${apt.availablePeople} spot(s) available` : null,
        apt.rating > 0 ? `Rating: ${apt.rating.toFixed(1)}/5 (${apt.ratingCount} reviews)` : null,
        apt.verified ? 'Verified' : 'Not yet verified',
        apt.ownerName ? `Owner: ${apt.ownerName}` : null,
      ];
      return parts.filter(Boolean).join(' | ');
    })
    .join('\n');

  return `Search criteria: ${criteria || 'none provided'}\nFound ${apartments.length} apartment(s) from the database:\n${listings}`;
}

function buildBookingContext(stats, language) {
  if (!stats) {
    return language === 'ar'
      ? 'معلومات الحجز غير متاحة حالياً.'
      : 'Booking information is temporarily unavailable.';
  }

  if (language === 'ar') {
    return [
      `المنصة فيها ${stats.totalBookings} حجز إجمالي`,
      `${stats.activeBookings} حجز نشط حالياً`,
      `${stats.availableApartments} شقة متاحة للحجز`,
      'عملية الحجز: اختار الشقة → قدم طلب حجز → المالك يوافق أو يرفض → تأكيد الحجز',
      'لو عايز تلغي حجز تواصل مع خدمة العملاء',
    ].join('. ') + '.';
  }

  return [
    `The platform has ${stats.totalBookings} total bookings`,
    `${stats.activeBookings} are currently active`,
    `${stats.availableApartments} apartments are available for booking`,
    'Booking process: Choose an apartment → Submit a booking request → Owner approves or rejects → Booking confirmed',
    'To cancel a booking, contact customer support',
  ].join('. ') + '.';
}

module.exports = {
  handleChat,
};
