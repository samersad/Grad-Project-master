/**
 * Intent Service for AI Chatbot
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
        content: `You are an intent classifier for SOKON, a student housing platform in Egypt.

Analyze the user's message and return JSON with:
{
  "intent": one of: "search_apartment", "booking_info", "platform_info", "contact_support", "general",
  "entities": {
    "location": string or null (city, district, or area the user mentioned),
    "rooms": number or null (how many bedrooms the user wants),
    "price": number or null (maximum price the user can pay),
    "query": string or null (any free-text search terms about apartment features)
  }
}

Rules:
- "search_apartment": user wants to find, search, browse, or compare apartments.
- "booking_info": user asks about the booking process, their bookings, booking status, payments, cancellation, refunds, or visit scheduling.
- "platform_info": user asks about the platform itself, how it works, statistics, available cities, or features.
- "contact_support": user explicitly wants to talk to a human, agent, or customer service.
- "general": greetings, thanks, small talk, or anything that doesn't fit above.

For location, extract the raw location text the user mentioned — do NOT normalize to a fixed list.
For query, extract descriptive terms like "near university", "furnished", "quiet", etc.
The user may write in English or Arabic. Understand both.`,
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
    price: extractPrice(message),
    query: null,
  };

  const isSearchIntent = /(?:شقق|شقة|شقه|سكن|متاح|عرض|بحث|دور|ايجار|فرجة|تفرج|فرجني|apartment|apartments|flat|flats|rent|show|find|list|search)/i.test(lower);

  if (isLikelyGreeting(lower)) {
    return { intent: 'general', entities };
  }

  if (isSearchIntent || entities.rooms || entities.price) {
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
      price: numberOrNull(rawEntities.price),
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

function extractPrice(message) {
  const priceMatch = message.match(
    /(?:under|below|max|maximum|budget|up\s*to|حد اقصى|بحد اقصى|ميزانية|الى|لحد)?\s*(?:egp|EGP|جنيه|ج\.?م)?\s*(\d{3,7})(?:\s*(?:egp|EGP|جنيه|ج\.?م|per month|\/month|monthly|شهري|في الشهر))?/i,
  );
  return priceMatch ? Number(priceMatch[1]) : null;
}

function isLikelyGreeting(lower) {
  if (lower.length > 30) return false;
  const greetingPatterns = /^(hi|hello|hey|good\s(morning|evening|afternoon)|مرحبا|اهلا|اهلن|السلام|سلام|صباح|مساء|ازيك|هاي|شكرا|thanks)\b/i;
  return greetingPatterns.test(lower.trim());
}

function normalizeText(value) {
  return value
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
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
