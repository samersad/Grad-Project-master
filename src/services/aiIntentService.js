/**
 * Intent Service for AI Chatbot
 * Performs intelligent classification and entity extraction.
 */

const OpenAI = require('openai');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  : null;

const VALID_INTENTS = [
  'search_apartment',
  'booking_info',
  'platform_info',
  'contact_support',
  'general',
];

async function detectIntentAndEntities(message) {
  if (openai) {
    try {
      return await openaiDetection(message);
    } catch (error) {
      console.error('OpenAI intent detection failed, using fallback:', error.message);
    }
  }

  return heuristicDetection(message);
}

async function openaiDetection(message) {
  const completion = await openai.chat.completions.create({
    model: 'gemini-2.5-flash',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an intent classifier and entity extractor for SOKON, a student housing platform in Egypt.

Analyze the user's message and return a JSON object with this exact structure:
{
  "intent": "search_apartment" | "booking_info" | "platform_info" | "contact_support" | "general",
  "entities": {
    "location": string | null,
    "rooms": number | null,
    "priceMin": number | null,
    "priceMax": number | null,
    "peopleCount": number | null,
    "ratingPref": boolean,
    "verifiedPref": boolean,
    "query": string | null
  }
}

Rules for Intent:
- "search_apartment": user wants to find, search, browse, or compare apartments.
- "booking_info": user asks about how to book, their bookings, statuses, payments, or scheduling visits.
- "platform_info": user asks about general platform info, statistics, or FAQ questions.
- "contact_support": user wants to talk to a human, admin, or support representative.
- "general": greetings, thanks, small talk.

Rules for Entities:
- location: Extract location names (e.g., "Assiut", "Ferial", "القاهرة", "أسيوط"). Do not translate, keep as mentioned.
- rooms: Number of rooms requested.
- priceMin: Minimum price/rent. If user says "more than 400" or "above 400" or "أكثر من ٤٠٠" or "أعلى من 400", set this to 400.
- priceMax: Maximum price/rent. If user says "under 3000" or "cheap", set this. If "cheap" is requested without a number, you can leave it null but set query to "cheap".
- peopleCount: Number of people or capacity (e.g. "for 3 people", "لشخصين" -> 2).
- ratingPref: Set to true if they ask for "best", "highest rated", "أفضل تقييم", "أعلى تقييم".
- verifiedPref: Set to true if they ask for "verified", "موثق", "مؤكد".
- query: Free-text search terms (e.g., "furnished", "near university", "مفروشة", "قريبة من الجامعة").

Understand both Arabic and English.`,
      },
      {
        role: 'user',
        content: message,
      },
    ],
  });

  let content = (completion.choices[0]?.message?.content || '').trim();
  
  if (content.startsWith('```json')) {
    content = content.slice(7);
  } else if (content.startsWith('```')) {
    content = content.slice(3);
  }
  if (content.endsWith('```')) {
    content = content.slice(0, -3);
  }
  content = content.trim();

  const parsed = JSON.parse(content);
  return normalizeAnalysis(parsed);
}

function heuristicDetection(message) {
  const lower = normalizeText(message);
  const entities = {
    location: extractLocation(message),
    rooms: extractRooms(lower),
    priceMin: extractPriceMin(message),
    priceMax: extractPriceMax(message),
    peopleCount: extractPeopleCount(lower),
    ratingPref: /(?:best|top|high|ممتاز|افضل|أفضل|احسن|أعلى|اعلى)/i.test(lower),
    verifiedPref: /(?:verified|trust|موثق|مؤكد|مضمون)/i.test(lower),
    query: extractFreeTextQuery(lower),
  };

  // If "cheap" is mentioned without a price, set a default max price or add to query
  if (/(?:cheap|رخيصة|رخيصه|سعر قليل|سعر منخفض)/.test(lower) && !entities.priceMax) {
    entities.priceMax = 2000; // Default threshold for "cheap"
    entities.query = (entities.query ? entities.query + ' ' : '') + 'cheap';
  }

  const isSearchIntent = /(?:شقق|شقة|شقه|سكن|متاح|عرض|بحث|دور|ايجار|فرجة|تفرج|فرجني|apartment|apartments|flat|flats|rent|show|find|list|search)/i.test(lower);

  if (isLikelyGreeting(lower)) {
    return { intent: 'general', entities };
  }

  if (isSearchIntent || entities.rooms || entities.priceMax || entities.priceMin || entities.peopleCount || entities.location) {
    return { intent: 'search_apartment', entities };
  }

  return { intent: 'general', entities };
}

function normalizeAnalysis(analysis) {
  const rawEntities = analysis.entities || {};
  return {
    intent: VALID_INTENTS.includes(analysis.intent) ? analysis.intent : 'general',
    entities: {
      location: typeof rawEntities.location === 'string' && rawEntities.location.trim()
        ? rawEntities.location.trim()
        : null,
      rooms: numberOrNull(rawEntities.rooms),
      priceMin: numberOrNull(rawEntities.priceMin),
      priceMax: numberOrNull(rawEntities.priceMax),
      peopleCount: numberOrNull(rawEntities.peopleCount),
      ratingPref: !!rawEntities.ratingPref,
      verifiedPref: !!rawEntities.verifiedPref,
      query: typeof rawEntities.query === 'string' && rawEntities.query.trim()
        ? rawEntities.query.trim()
        : null,
    },
  };
}

function extractRooms(normalizedMessage) {
  const roomMatch = normalizedMessage.match(
    /(\d+)\s*(?:room|rooms|bedroom|bedrooms|bed|br|غرف|غرفة|اوضة|اوض|أوضة|أوض)/i,
  );
  if (roomMatch) return Number(roomMatch[1]);

  if (/\bstudio\b/i.test(normalizedMessage)) return 1;

  return null;
}

function extractPeopleCount(normalizedMessage) {
  // Matches "for 3 people", "for 2 students", "لشخصين", "لثلاثة"
  const arabicWordToNumber = {
    'شخص': 1,
    'شخصين': 2,
    'فرد': 1,
    'فردين': 2,
    'شخصين': 2,
    'طالبين': 2,
  };

  for (const [word, num] of Object.entries(arabicWordToNumber)) {
    if (normalizedMessage.includes(word)) {
      return num;
    }
  }

  const peopleMatch = normalizedMessage.match(
    /(?:for|capacity|fit|suits|شخص|افراد|أفراد|فرد|طالب|طلاب)\s*(\d+)/i,
  );
  if (peopleMatch) return Number(peopleMatch[1]);

  const peopleMatchRev = normalizedMessage.match(
    /(\d+)\s*(?:people|persons|students|افراد|أفراد|اشخاص|أشخاص|طلاب|فرد)/i,
  );
  if (peopleMatchRev) return Number(peopleMatchRev[1]);

  return null;
}

function extractPriceMin(message) {
  // Matches "more than 400", "above 400", "أكثر من 400", "أعلى من 400", "من 400 وطالع"
  const lower = message.toLowerCase();
  const minMatch = lower.match(
    /(?:more than|above|greater than|higher than|starts from|أكثر من|اكتر من|أعلى من|اعلى من|فوق|من)\s*(?:egp|EGP|جنيه|ج\.?م)?\s*(\d{3,7})/i,
  );
  if (minMatch) return Number(minMatch[1]);

  const minMatchArabicSuffix = lower.match(
    /(\d{3,7})\s*(?:وطالع|واكتر|وأكثر)/i,
  );
  if (minMatchArabicSuffix) return Number(minMatchArabicSuffix[1]);

  return null;
}

function extractPriceMax(message) {
  const lower = message.toLowerCase();
  // Avoid matching "more than 400" as max price
  if (/(?:more than|above|greater than|higher than|أكثر من|اكتر من|أعلى من|اعلى من|فوق)/.test(lower)) {
    return null;
  }

  const maxMatch = lower.match(
    /(?:under|below|max|maximum|budget|up\s*to|حد اقصى|بحد اقصى|ميزانية|الى|لحد|اقل من|أقل من)?\s*(?:egp|EGP|جنيه|ج\.?م)?\s*(\d{3,7})(?:\s*(?:egp|EGP|جنيه|ج\.?م|per month|\/month|monthly|شهري|في الشهر))?/i,
  );
  return maxMatch ? Number(maxMatch[1]) : null;
}

function extractFreeTextQuery(lower) {
  const queries = [];
  if (/(?:furnished|مفروش)/.test(lower)) queries.push('furnished');
  if (/(?:university|جامعه|جامعة)/.test(lower)) queries.push('university');
  if (/(?:quiet|هادي|هادئ)/.test(lower)) queries.push('quiet');
  if (/(?:clean|نظيف|نضيف)/.test(lower)) queries.push('clean');
  return queries.length > 0 ? queries.join(' ') : null;
}

function isLikelyGreeting(lower) {
  if (lower.length > 30) return false;
  const greetingPatterns = /^(hi|hello|hey|good\s(morning|evening|afternoon)|مرحبا|اهلا|اهلن|السلام|سلام|صباح|مساء|ازيك|هاي|شكرا|thanks)\b/i;
  return greetingPatterns.test(lower.trim());
}

function normalizeText(value) {
  return value
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'i') // normalized for match
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652]/g, '')
    .toLowerCase();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function extractLocation(message) {
  const lower = message.toLowerCase();

  const arabicMatch = lower.match(/(?:في|بـ|ب)\s+([\u0600-\u06FFa-zA-Z0-9]+(?:\s+[\u0600-\u06FFa-zA-Z0-9]+)?)/);
  if (arabicMatch) {
    const loc = arabicMatch[1].trim();
    const stopWords = /^(شقه|شقة|سكن|ايجار|غرفة|غرف|غرفه|اوضه|اوض|بيت|مكان|حد|سعر|ميزانية)$/;
    if (!stopWords.test(loc)) {
      return loc;
    }
  }

  const englishMatch = lower.match(/(?:in|near|at|around)\s+([a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)?)/);
  if (englishMatch) {
    const loc = englishMatch[1].trim();
    const stopWords = /^(apartment|apartments|flat|flats|room|rooms|house|rent|budget|price)$/;
    if (!stopWords.test(loc)) {
      return loc;
    }
  }

  return null;
}

function isArabicMessage(message) {
  return /[\u0600-\u06ff]/.test(message);
}

module.exports = {
  detectIntentAndEntities,
  isArabicMessage,
};
