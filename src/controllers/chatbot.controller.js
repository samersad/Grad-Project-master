/**
 * Chatbot Controller — Database-Driven AI Responses
 */

const logger = require('../config/logger');
const { generateChatResponse } = require('../services/aiOpenaiService');
const { detectIntentAndEntities, isArabicMessage } = require('../services/aiIntentService');
const { parseApartmentSearch } = require('../services/aiApartmentSearchParser');
const { searchApartments } = require('../services/aiApartmentService');
const { getFaqAnswer } = require('../services/aiFaqService');
const db = require('../services/aiDatabaseService');

/**
 * Handle incoming chat messages.
 * Understands intent, searches database, and generates natural language response.
 */
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

    // 1. Detect intent first, then refine apartment searches with the structured parser.
    const analysis = await detectIntentAndEntities(cleanMessage);
    const { intent, entities } = analysis;

    let data = null;
    let suggestions = [];
    let answerContext = '';
    let searchFilters = null;
    let parserSource = null;
    let needsClarification = false;
    let clarificationQuestion = null;
    let quickReplies = [];

    const shouldSearchApartment =
      intent === 'search_apartment' ||
      /[\u0600-\u06ffa-zA-Z]/.test(cleanMessage) && /(?:\bفي\b|\bin\b|\bunder\b|\bover\b|\bmore than\b|\bless than\b|\bbetween\b|\bprice\b|\bسعر\b|\bشقة\b|\bشقق\b|\bflat\b|\bapartment\b|\broom\b|\brooms\b|\bbath\b|\bfloor\b|\bverified\b|\bغرفة\b|\bغرف\b|\bحمام\b|\bدور\b|\bموثق\b|\bاوضة\b|\bشقه\b)/i.test(cleanMessage);

    // 2. Fetch real data from the database based on intent.
    if (shouldSearchApartment) {
      const searchMetadata = await db.getSearchMetadata();
      const parsedSearch = await parseApartmentSearch(cleanMessage, entities, searchMetadata);
      searchFilters = parsedSearch.filters;
      parserSource = parsedSearch.source;
      needsClarification = parsedSearch.needsClarification;
      clarificationQuestion = parsedSearch.clarificationQuestion;
      quickReplies = buildQuickReplies(language, searchFilters, needsClarification);

      logger.info(
        {
          originalMessage: cleanMessage,
          detectedIntent: intent,
          parserSource,
          extractedFilters: searchFilters,
          availableDistricts: searchMetadata.districts,
        },
        'AI apartment search parsed',
      );

      if (needsClarification) {
        const reply = clarificationQuestion || (language === 'ar'
          ? 'ممكن توضح الحي أو نطاق السعر اللي تقصده؟'
          : 'Can you clarify the district or price range?');

        return res.json({
          success: true,
          reply,
          suggestions: [],
          data: null,
          intent: 'search_apartment',
          entities: {
            ...entities,
            searchFilters,
          },
          searchFilters,
          needsClarification: true,
          clarificationQuestion: reply,
          quickReplies,
          language,
        });
      }

      const result = await searchApartments(searchFilters);
      suggestions = result.apartments;
      data = result.apartments;

      logger.info(
        {
          originalMessage: cleanMessage,
          detectedIntent: intent,
          parserSource,
          extractedFilters: searchFilters,
          mongoFilter: result.mongoFilter || null,
        },
        'AI apartment search database query prepared',
      );

      answerContext = buildApartmentContext(result.apartments, searchFilters, language, result.isFallback);
      quickReplies = buildQuickReplies(language, searchFilters, false, result.apartments.length);
    }

    // booking_info: Information about how to book or platform stats
    else if (intent === 'booking_info') {
      const stats = await db.getPlatformStats();
      data = {
        totalBookings: stats?.totalBookings || 0,
        activeBookings: stats?.activeBookings || 0,
      };
      answerContext = buildBookingContext(stats, language);
    }

    // platform_info: FAQ or Platform stats
    else if (intent === 'platform_info') {
      const faqResult = await getFaqAnswer(cleanMessage, intent);
      data = faqResult.stats || null;
      answerContext = faqResult.answer;
    }

    // contact_support: Human support contact details
    else if (intent === 'contact_support') {
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

    // general: Greeting or fallback platform info
    else {
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

    // 3. Generate natural language response using AI grounded in DB data.
    const reply = await generateChatResponse({
      userMessage: cleanMessage,
      intent: shouldSearchApartment ? 'search_apartment' : intent,
      entities: {
        ...entities,
        searchFilters,
      },
      answerContext,
      language: intent === 'contact_support' ? 'ar' : language,
    });

    // 4. Return structured result (reply + suggestions).
    return res.json({
      success: true,
      reply,
      suggestions,
      data: suggestions.length > 0 ? suggestions : data,
      intent: shouldSearchApartment ? 'search_apartment' : intent,
      entities: {
        ...entities,
        searchFilters,
      },
      searchFilters,
      parserSource,
      needsClarification,
      clarificationQuestion,
      quickReplies,
      language,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Build a text context from apartment listings for the AI to reason with.
 */
function buildApartmentContext(apartments, filters, language, isFallback = false) {
  if (!apartments || apartments.length === 0) {
    return language === 'ar'
      ? 'لم يتم العثور على شقق مطابقة حالياً. اقترح على المستخدم تغيير المكان أو عدد الغرف أو الميزانية.'
      : 'No matching apartments were found in the database. Suggest the user to change location, room count, or budget.';
  }

  let statusMessage = '';
  if (isFallback) {
    statusMessage = language === 'ar'
      ? 'تحذير: لم يتم العثور على شقق مطابقة تماماً للميزانية أو الطلب. النتائج المعروضة هي أقرب بدائل متاحة حالياً.'
      : 'Warning: No exact matches found for the requested price or criteria. The results below are the closest available alternatives.';
  }

  const criteria = [
    filters?.district ? `district: ${filters.district}` : null,
    filters?.propertyType ? `property type: ${filters.propertyType}` : null,
    filters?.minPrice != null ? `minimum price: ${filters.minPrice} EGP` : null,
    filters?.maxPrice != null ? `maximum price: ${filters.maxPrice} EGP` : null,
    filters?.priceOperator ? `price operator: ${filters.priceOperator}` : null,
    filters?.bedrooms ? `bedrooms: ${filters.bedrooms}` : null,
    filters?.bathrooms ? `bathrooms: ${filters.bathrooms}` : null,
    filters?.floor ? `floor: ${filters.floor}` : null,
    filters?.peopleCount ? `capacity for: ${filters.peopleCount}` : null,
    filters?.verifiedPref ? 'verified only' : null,
    filters?.minRating ? `minimum rating: ${filters.minRating}` : null,
    filters?.query ? `features: ${filters.query}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const listings = apartments
    .map((apt) => {
      const parts = [
        apt.name,
        apt.city ? `City: ${apt.city}` : null,
        apt.district ? `District: ${apt.district}` : null,
        apt.bedrooms != null ? `${apt.bedrooms} BR` : null,
        apt.price != null ? `${apt.price} EGP` : null,
        apt.available_people != null ? `${apt.available_people} available` : null,
        apt.rating_average > 0 ? `Rating: ${apt.rating_average.toFixed(1)}` : null,
        apt.verified ? 'Verified' : 'Not Verified',
      ];
      return parts.filter(Boolean).join(' | ');
    })
    .join('\n');

  return `${statusMessage}\nCriteria: ${criteria || 'none'}\nResults from Database:\n${listings}`;
}

function buildQuickReplies(language, filters = {}, needsClarification = false, resultCount = null) {
  const arabic = language === 'ar';

  if (needsClarification) {
    return arabic
      ? ['اختار منطقة', 'حدد الميزانية', 'اعرض الشقق الموثقة']
      : ['Choose district', 'Set budget', 'Verified only'];
  }

  if (resultCount === 0) {
    return arabic
      ? ['زود الميزانية', 'غير المنطقة', 'قلل عدد الغرف']
      : ['Increase budget', 'Change district', 'Fewer rooms'];
  }

  const replies = [];
  if (!filters?.verifiedPref) replies.push(arabic ? 'شقق موثقة فقط' : 'Verified only');
  if (!filters?.ratingPref) replies.push(arabic ? 'الأعلى تقييماً' : 'Highest rated');
  if (!filters?.maxPrice) replies.push(arabic ? 'حدد ميزانية' : 'Set budget');
  if (!filters?.bedrooms) replies.push(arabic ? 'حدد عدد الغرف' : 'Set bedrooms');
  return replies.slice(0, 4);
}

/**
 * Build a text context from platform stats.
 */
function buildBookingContext(stats, language) {
  if (!stats) return '';

  if (language === 'ar') {
    return [
      `إجمالي الحجوزات: ${stats.totalBookings}`,
      `حجوزات نشطة: ${stats.activeBookings}`,
      `شقق متاحة حالياً: ${stats.availableApartments}`,
      'خطوات الحجز: تصفح الشقق → اطلب الحجز → انتظار موافقة المالك → تأكيد الدفع',
    ].join('\n');
  }

  return [
    `Total bookings: ${stats.totalBookings}`,
    `Active bookings: ${stats.activeBookings}`,
    `Available apartments: ${stats.availableApartments}`,
    'Booking steps: Browse apartments → Request booking → Wait for owner approval → Confirm payment',
  ].join('\n');
}

module.exports = {
  handleChat,
};
