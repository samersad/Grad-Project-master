const OpenAI = require('openai');
const logger = require('../config/logger');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  : null;

const DISTRICT_ALIASES = [
  {
    canonical: 'فريال',
    aliases: ['فريال', 'فرياال', 'فرييال', 'ferial', 'faryal', 'faryaal', 'feryal'],
  },
  {
    canonical: 'سيتي',
    aliases: ['سيتي', 'ستى', 'ستي', 'city', 'city district', 'sity', 'citi'],
  },
  {
    canonical: 'سيد',
    aliases: ['سيد', 'سيدى', 'سيدي', 'sayed', 'sayid', 'said', 'sidi'],
  },
  {
    canonical: 'الجمهوريه',
    aliases: [
      'الجمهوريه',
      'الجمهورية',
      'جمهوريه',
      'جمهورية',
      'el gomhoria',
      'el gomhoureya',
      'el gomhorreya',
      'gomhoria',
      'gomhoureya',
      'gomhorreya',
      'al gomhoria',
      'republic',
    ],
  },
  {
    canonical: 'يسري راغب',
    aliases: [
      'يسري راغب',
      'يسرى راغب',
      'يسري راغب',
      'yosry ragheb',
      'yosri ragheb',
      'yousry ragheb',
      'yousri ragheb',
      'yosry',
      'yousry',
    ],
  },
  {
    canonical: 'آخر',
    aliases: ['آخر', 'اخر', 'أخر', 'اخري', 'أخرى', 'other', 'another', 'others'],
  },
];

const APARTMENT_HINTS = ['شقة', 'شقق', 'شقه', 'apartment', 'apartments', 'flat', 'flats', 'سكن'];
const ROOM_HINTS = ['غرفة', 'غرف', 'اوضة', 'اوض', 'أوضة', 'أوض', 'room', 'rooms', 'bedroom', 'bedrooms'];

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (digit) => ({ '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' }[digit] || digit))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeForMatch(value) {
  return collapseRepeatedCharacters(normalizeSearchText(value));
}

function collapseRepeatedCharacters(value) {
  return value.replace(/([a-z\u0600-\u06ff])\1+/gi, '$1');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasMatchesMessage(normalizedMessage, alias) {
  const normalizedAlias = normalizeForMatch(alias);
  if (!normalizedAlias) return false;
  if (/^[a-z0-9\s]+$/i.test(normalizedAlias)) {
    return new RegExp(`(?:^|\\s)${escapeRegExp(normalizedAlias)}(?:\\s|$)`, 'i').test(normalizedMessage);
  }
  return normalizedMessage.includes(normalizedAlias);
}

function containsAny(text, variants) {
  const normalized = normalizeForMatch(text);
  return variants.some((variant) => normalized.includes(normalizeForMatch(variant)));
}

function detectPropertyType(message) {
  if (containsAny(message, ROOM_HINTS)) {
    return 'room';
  }
  if (containsAny(message, APARTMENT_HINTS)) {
    return 'apartment';
  }
  return 'apartment';
}

function canonicalizeDistrict(input) {
  if (!input) {
    return { district: null, districtVariants: [] };
  }

  const normalizedInput = normalizeForMatch(input);
  for (const entry of DISTRICT_ALIASES) {
    const variants = [entry.canonical, ...entry.aliases];
    if (variants.some((variant) => normalizeForMatch(variant) === normalizedInput)) {
      return { district: entry.canonical, districtVariants: [...new Set(variants)] };
    }
  }

  return { district: input.trim(), districtVariants: [input.trim()] };
}

function extractDistrict(message) {
  const normalizedMessage = normalizeForMatch(message);

  for (const entry of DISTRICT_ALIASES) {
    for (const variant of [entry.canonical, ...entry.aliases]) {
      if (aliasMatchesMessage(normalizedMessage, variant)) {
        return canonicalizeDistrict(variant);
      }
    }
  }

  const connectorMatch = String(message || '').match(
    /(?:\bفي\b|\bبمنطقة\b|\bبالمنطقة\b|\bdistrict\b|\barea\b|\blocation\b|\bin\b|\bat\b|\baround\b)\s+([^,.;!?]+?)(?=(?:\s+(?:سعر|price|more|less|under|over|above|below|between|from|to|greater|smaller|اكتر|أكثر|اقل|أقل|فوق|تحت|لحد|حد)|[,.;!?]|$))/i,
  );

  if (connectorMatch) {
    const raw = connectorMatch[1].trim();
    const cleaned = raw.replace(/\b(?:district|area|location|region|حي|منطقة|المنطقة)\b/gi, '').trim();
    if (cleaned) {
      return canonicalizeDistrict(cleaned);
    }
  }

  return { district: null, districtVariants: [] };
}

function parseNumber(rawValue) {
  if (rawValue == null) return null;
  const normalized = normalizeSearchText(rawValue).replace(/[\s,]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractPriceFilter(message) {
  const normalized = normalizeSearchText(message);

  const betweenPatterns = [
    /(?:between|from|من)\s*(\d[\d,]*)\s*(?:to|and|الى|إلى|ل|حتى|\-|—)\s*(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:to|and|الى|إلى|ل|حتى|\-|—)\s*(\d[\d,]*)\s*(?:egp|جنيه|ج\.?م|le|l\.?e)?/i,
  ];

  for (const pattern of betweenPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const first = parseNumber(match[1]);
      const second = parseNumber(match[2]);
      if (first != null && second != null) {
        return { minPrice: Math.min(first, second), maxPrice: Math.max(first, second), priceOperator: 'between' };
      }
    }
  }

  const greaterPatterns = [
    /(?:more than|greater than|above|over|higher than|at least|اكتر من|أكثر من|اعلى من|أعلى من|فوق|>\s*)(?:egp|جنيه|ج\.?م|le|l\.?e)?\s*(\d[\d,]*)/i,
    />\s*(\d[\d,]*)/,
  ];

  for (const pattern of greaterPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = parseNumber(match[1]);
      if (value != null) {
        return { minPrice: value, maxPrice: null, priceOperator: 'gt' };
      }
    }
  }

  const lessPatterns = [
    /(?:under|less than|below|cheaper than|up to|max(?:imum)?|budget up to|اقل من|أقل من|تحت|بحد اقصى|حد اقصى|لحد|<\s*)(?:egp|جنيه|ج\.?م|le|l\.?e)?\s*(\d[\d,]*)/i,
    /<\s*(\d[\d,]*)/,
  ];

  for (const pattern of lessPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = parseNumber(match[1]);
      if (value != null) {
        return { minPrice: null, maxPrice: value, priceOperator: 'lt' };
      }
    }
  }

  return { minPrice: null, maxPrice: null, priceOperator: null };
}

function extractQueryHints(message) {
  const normalized = normalizeForMatch(message);
  const hints = [];
  if (containsAny(normalized, ['furnished', 'fully furnished', 'مفروش', 'مفروشه'])) hints.push('furnished');
  if (containsAny(normalized, ['university', 'جامعة', 'جامعه', 'near university', 'قريبة من الجامعة'])) hints.push('university');
  if (containsAny(normalized, ['quiet', 'هادئ', 'هادي'])) hints.push('quiet');
  if (containsAny(normalized, ['clean', 'نظيف', 'نضيف'])) hints.push('clean');
  return hints.length > 0 ? hints.join(' ') : null;
}

function clarifyQuestion(message) {
  const arabic = /[\u0600-\u06ff]/.test(message);
  return arabic
    ? 'هل تريد البحث في حي معين أو بسعر محدد؟ اكتب الحي ونطاق السعر وسأعرض الشقق المطابقة.'
    : 'Which district or price range are you looking for? Share the details and I will show matching apartments.';
}

function buildLocalFilters(message, seedFilters = {}) {
  const districtInfo = extractDistrict(message);
  const priceInfo = extractPriceFilter(message);
  const filters = {
    propertyType: seedFilters.propertyType || detectPropertyType(message),
    district: seedFilters.district || districtInfo.district,
    districtVariants:
      Array.isArray(seedFilters.districtVariants) && seedFilters.districtVariants.length > 0
        ? [...new Set(seedFilters.districtVariants.filter(Boolean))]
        : districtInfo.districtVariants,
    minPrice: seedFilters.minPrice != null ? Number(seedFilters.minPrice) : priceInfo.minPrice,
    maxPrice: seedFilters.maxPrice != null ? Number(seedFilters.maxPrice) : priceInfo.maxPrice,
    priceOperator: seedFilters.priceOperator || priceInfo.priceOperator,
    query: seedFilters.query || extractQueryHints(message),
  };

  if (filters.district) {
    const resolvedDistrict = canonicalizeDistrict(filters.district);
    filters.district = resolvedDistrict.district;
    filters.districtVariants = [
      ...new Set([...filters.districtVariants, ...resolvedDistrict.districtVariants].filter(Boolean)),
    ];
  }

  if (!filters.priceOperator) {
    if (filters.minPrice != null && filters.maxPrice != null) {
      filters.priceOperator = 'between';
    } else if (filters.minPrice != null) {
      filters.priceOperator = 'gt';
    } else if (filters.maxPrice != null) {
      filters.priceOperator = 'lt';
    }
  }

  return filters;
}

function needsClarification(message, filters) {
  if (filters.priceOperator === 'between' && (filters.minPrice == null || filters.maxPrice == null)) {
    return true;
  }

  const hasUsefulCriteria = Boolean(
    filters.district || filters.minPrice != null || filters.maxPrice != null || filters.query,
  );
  if (hasUsefulCriteria) {
    return false;
  }

  return containsAny(message, [
    'شقة',
    'شقق',
    'شقه',
    'سكن',
    'غرفة',
    'room',
    'apartment',
    'flat',
    'rent',
    'search',
    'find',
    'show me',
    'عاوز',
    'عايز',
    'need',
  ]);
}

function normalizeOpenAIResult(result, message) {
  const parsed = result || {};
  const localFilters = buildLocalFilters(message);
  const filters = {
    propertyType: typeof parsed.propertyType === 'string' && parsed.propertyType.trim()
      ? parsed.propertyType.trim().toLowerCase()
      : localFilters.propertyType,
    district: typeof parsed.district === 'string' && parsed.district.trim()
      ? parsed.district.trim()
      : localFilters.district,
    districtVariants: Array.isArray(parsed.districtVariants) && parsed.districtVariants.length > 0
      ? parsed.districtVariants.map((item) => String(item).trim()).filter(Boolean)
      : localFilters.districtVariants,
    minPrice: parseNumber(parsed.minPrice) ?? localFilters.minPrice,
    maxPrice: parseNumber(parsed.maxPrice) ?? localFilters.maxPrice,
    priceOperator: ['gt', 'lt', 'between'].includes(parsed.priceOperator) ? parsed.priceOperator : localFilters.priceOperator,
    query: typeof parsed.query === 'string' && parsed.query.trim() ? parsed.query.trim() : localFilters.query,
  };

  if (filters.district) {
    const resolvedDistrict = canonicalizeDistrict(filters.district);
    filters.district = resolvedDistrict.district;
    filters.districtVariants = [
      ...new Set([...filters.districtVariants, ...resolvedDistrict.districtVariants].filter(Boolean)),
    ];
  }
  if (!filters.priceOperator) {
    if (filters.minPrice != null && filters.maxPrice != null) filters.priceOperator = 'between';
    else if (filters.minPrice != null) filters.priceOperator = 'gt';
    else if (filters.maxPrice != null) filters.priceOperator = 'lt';
  }
  if (!filters.propertyType) {
    filters.propertyType = detectPropertyType(message);
  }
  return filters;
}

async function parseApartmentSearch(message, seedFilters = {}) {
  const text = String(message || '').trim();
  const seeded = buildLocalFilters(text, seedFilters);

  if (!text) {
    return {
      source: 'rules',
      detectedIntent: 'search_apartment',
      filters: seeded,
      needsClarification: true,
      clarificationQuestion: clarifyQuestion(text),
    };
  }

  if (openai) {
    try {
      const parsed = await openaiParse(text);
      const filters = normalizeOpenAIResult(parsed, text);
      const clarification = Boolean(parsed.needsClarification) || needsClarification(text, filters);
      return {
        source: 'openai',
        detectedIntent: 'search_apartment',
        filters,
        needsClarification: clarification,
        clarificationQuestion:
          typeof parsed.clarificationQuestion === 'string' && parsed.clarificationQuestion.trim()
            ? parsed.clarificationQuestion.trim()
            : clarification
              ? clarifyQuestion(text)
              : null,
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'OpenAI apartment parsing failed, using rule-based parser');
    }
  }

  const clarification = needsClarification(text, seeded);
  return {
    source: 'rules',
    detectedIntent: 'search_apartment',
    filters: seeded,
    needsClarification: clarification,
    clarificationQuestion: clarification ? clarifyQuestion(text) : null,
  };
}

async function openaiParse(message) {
  const completion = await openai.chat.completions.create({
    model: 'gemini-2.5-flash',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Extract structured apartment search filters for SOKON.
Return valid JSON only with these fields:
{
  "propertyType": "apartment" | "room" | null,
  "district": string | null,
  "districtVariants": string[],
  "minPrice": number | null,
  "maxPrice": number | null,
  "priceOperator": "gt" | "lt" | "between" | null,
  "query": string | null,
  "needsClarification": boolean,
  "clarificationQuestion": string | null
}
Rules:
- Normalize district names to one of the configured districts when possible: فريال, سيتي, سيد, الجمهوريه, يسري راغب, آخر.
- Common examples: Ferial/Faryal -> فريال, City -> سيتي, Sayed/Sidi -> سيد, El Gomhoria -> الجمهوريه, Yosry Ragheb -> يسري راغب, Other -> آخر.
- Use "apartment" for apartment searches and "room" only if the user explicitly asks for a room.
- For more than / greater than / اكتر من / اكثر من / فوق, set priceOperator to gt and fill minPrice.
- For less than / under / اقل من / أقل من / تحت, set priceOperator to lt and fill maxPrice.
- For between / from ... to ... / من ... ل ..., set priceOperator to between and fill both minPrice and maxPrice.
- If the request is missing the district or any usable price information, set needsClarification to true and ask a short follow-up in the same language as the user.
- Understand Arabic, English, and informal Egyptian Arabic.`,
      },
      { role: 'user', content: message },
    ],
  });

  let content = completion.choices[0]?.message?.content || '{}';
  content = content.trim();
  if (content.startsWith('```json')) content = content.slice(7);
  if (content.startsWith('```')) content = content.slice(3);
  if (content.endsWith('```')) content = content.slice(0, -3);
  return JSON.parse(content.trim());
}

module.exports = {
  parseApartmentSearch,
  normalizeSearchText,
  normalizeForMatch,
  canonicalizeDistrict,
  extractDistrict,
  extractPriceFilter,
  buildLocalFilters,
};

