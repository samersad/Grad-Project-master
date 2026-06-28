const OpenAI = require('openai');
const logger = require('../config/logger');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  : null;

const STATIC_DISTRICT_ALIASES = [
  { canonical: 'فريال', aliases: ['فريال', 'فرياال', 'فرييال', 'ferial', 'faryal', 'faryaal', 'feryal'] },
  { canonical: 'سيتي', aliases: ['سيتي', 'ستى', 'ستي', 'city', 'city district', 'sity', 'citi'] },
  { canonical: 'سيد', aliases: ['سيد', 'سيدى', 'سيدي', 'sayed', 'sayid', 'said', 'sidi'] },
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
    aliases: ['يسري راغب', 'يسرى راغب', 'yosry ragheb', 'yosri ragheb', 'yousry ragheb', 'yousri ragheb', 'yosry', 'yousry'],
  },
  { canonical: 'آخر', aliases: ['آخر', 'اخر', 'أخر', 'اخري', 'أخرى', 'other', 'another', 'others'] },
];

const APARTMENT_HINTS = ['شقة', 'شقق', 'شقه', 'apartment', 'apartments', 'flat', 'flats', 'سكن'];
const ROOM_HINTS = ['غرفة', 'غرف', 'اوضة', 'اوض', 'أوضة', 'أوض', 'room', 'rooms', 'bedroom', 'bedrooms'];
const VALID_PARSE_INTENTS = ['search_apartment', 'not_apartment_search'];

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

function inferLocalSearchIntent(message, filters) {
  const normalized = normalizeForMatch(message);
  if (isLikelyGreeting(normalized)) return false;

  const hasSearchSignal = containsAny(normalized, [
    ...APARTMENT_HINTS,
    ...ROOM_HINTS,
    'rent',
    'search',
    'find',
    'show me',
    'need',
    'عاوز',
    'عايز',
    'محتاج',
    'هاتلي',
    'دور',
  ]);

  const hasFilterSignal = Boolean(
    filters.district ||
      filters.minPrice != null ||
      filters.maxPrice != null ||
      filters.bedrooms ||
      filters.bathrooms ||
      filters.floor ||
      filters.peopleCount ||
      filters.verifiedPref ||
      filters.ratingPref ||
      filters.query,
  );

  return hasSearchSignal || hasFilterSignal;
}

function isLikelyGreeting(normalized) {
  if (normalized.length > 35) return false;
  return /^(hi|hello|hey|good morning|good evening|thanks|thank you|مرحبا|اهلا|اهلن|السلام|سلام|صباح|مساء|ازيك|هاي|شكرا)\b/i.test(normalized);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildDistrictCatalog(dynamicDistricts = []) {
  const byCanonical = new Map();
  for (const entry of STATIC_DISTRICT_ALIASES) {
    byCanonical.set(entry.canonical, { canonical: entry.canonical, aliases: unique([entry.canonical, ...entry.aliases]) });
  }

  for (const rawDistrict of dynamicDistricts || []) {
    if (typeof rawDistrict !== 'string' || !rawDistrict.trim()) continue;
    const canonical = rawDistrict.trim();
    const staticMatch = findStaticDistrict(canonical);
    const resolvedCanonical = staticMatch?.canonical || canonical;
    const existing = byCanonical.get(resolvedCanonical) || { canonical: resolvedCanonical, aliases: [] };
    existing.aliases = unique([...existing.aliases, canonical, resolvedCanonical]);
    byCanonical.set(resolvedCanonical, existing);
  }

  return [...byCanonical.values()];
}

function findStaticDistrict(input) {
  const normalizedInput = normalizeForMatch(input);
  return STATIC_DISTRICT_ALIASES.find((entry) =>
    [entry.canonical, ...entry.aliases].some((alias) => normalizeForMatch(alias) === normalizedInput),
  );
}

function detectPropertyType(message) {
  if (containsAny(message, ROOM_HINTS)) return 'room';
  if (containsAny(message, APARTMENT_HINTS)) return 'apartment';
  return 'apartment';
}

function canonicalizeDistrict(input, dynamicDistricts = []) {
  if (!input) return { district: null, districtVariants: [], districtMatchConfidence: 0 };

  const catalog = buildDistrictCatalog(dynamicDistricts);
  const normalizedInput = normalizeForMatch(input);

  for (const entry of catalog) {
    if (entry.aliases.some((alias) => normalizeForMatch(alias) === normalizedInput)) {
      return { district: entry.canonical, districtVariants: entry.aliases, districtMatchConfidence: 1 };
    }
  }

  const fuzzy = findBestDistrictMatch(input, catalog);
  if (fuzzy && fuzzy.score >= 0.72) {
    return { district: fuzzy.entry.canonical, districtVariants: fuzzy.entry.aliases, districtMatchConfidence: fuzzy.score };
  }

  return { district: input.trim(), districtVariants: [input.trim()], districtMatchConfidence: 0.5 };
}

function extractDistrict(message, options = {}) {
  const catalog = buildDistrictCatalog(options.districts);
  const normalizedMessage = normalizeForMatch(message);

  for (const entry of catalog) {
    for (const alias of entry.aliases) {
      if (aliasMatchesMessage(normalizedMessage, alias)) {
        return { district: entry.canonical, districtVariants: entry.aliases, districtMatchConfidence: 1 };
      }
    }
  }

  const candidate = extractDistrictCandidate(message);
  if (candidate) {
    return canonicalizeDistrict(candidate, options.districts);
  }

  return { district: null, districtVariants: [], districtMatchConfidence: 0 };
}

function extractDistrictCandidate(message) {
  const match = String(message || '').match(
    /(?:\bفي\b|\bبمنطقة\b|\bبالمنطقة\b|\bdistrict\b|\barea\b|\blocation\b|\bin\b|\bat\b|\baround\b|\bnear\b)\s+([^,.;!?]+?)(?=(?:\s+(?:سعر|price|more|less|under|over|above|below|between|from|to|greater|smaller|اكتر|أكثر|اقل|أقل|فوق|تحت|لحد|حد|غرف|غرفة|room|rooms|bath|floor|دور)|[,.;!?]|$))/i,
  );
  if (!match) return null;
  const candidate = match[1]
    .replace(/\b(?:district|area|location|region|حي|منطقة|المنطقة|near)\b/gi, '')
    .trim();
  if (/^(university|جامعه|جامعة|campus|الجامعة|الجامعه)$/i.test(normalizeSearchText(candidate))) return null;
  return candidate;
}

function findBestDistrictMatch(input, catalog) {
  const normalizedInput = normalizeForMatch(input);
  if (!normalizedInput) return null;

  let best = null;
  for (const entry of catalog) {
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeForMatch(alias);
      if (!normalizedAlias) continue;
      const score = similarity(normalizedInput, normalizedAlias);
      if (!best || score > best.score) best = { entry, alias, score };
    }
  }
  return best;
}

function similarity(a, b) {
  if (a === b) return 1;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
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

  for (const pattern of [
    /(?:more than|greater than|above|over|higher than|at least|اكتر من|أكثر من|اعلى من|أعلى من|فوق|>\s*)(?:egp|جنيه|ج\.?م|le|l\.?e)?\s*(\d[\d,]*)/i,
    />\s*(\d[\d,]*)/,
  ]) {
    const match = normalized.match(pattern);
    if (match) {
      const value = parseNumber(match[1]);
      if (value != null) return { minPrice: value, maxPrice: null, priceOperator: 'gt' };
    }
  }

  for (const pattern of [
    /(?:under|less than|below|cheaper than|up to|max(?:imum)?|budget up to|اقل من|أقل من|تحت|بحد اقصى|حد اقصى|لحد|<\s*)(?:egp|جنيه|ج\.?م|le|l\.?e)?\s*(\d[\d,]*)/i,
    /<\s*(\d[\d,]*)/,
  ]) {
    const match = normalized.match(pattern);
    if (match) {
      const value = parseNumber(match[1]);
      if (value != null) return { minPrice: null, maxPrice: value, priceOperator: 'lt' };
    }
  }

  return { minPrice: null, maxPrice: null, priceOperator: null };
}

function extractIntegerFilter(message, patterns) {
  const normalized = normalizeSearchText(message);
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = parseNumber(match[1]);
      if (value != null) return value;
    }
  }
  return null;
}

function extractFeatureFilters(message) {
  const normalized = normalizeSearchText(message);
  return {
    bedrooms: extractIntegerFilter(normalized, [
      /(\d+)\s*(?:bedroom|bedrooms|beds|br|غرف|غرفة|غرفه|اوض|اوضة|اوضه)/i,
      /(?:غرف|غرفة|غرفه|اوض|اوضة|اوضه|bedroom|bedrooms|beds|br)\s*(\d+)/i,
    ]) ?? extractArabicImplicitCount(normalized, [
      ['غرفتين', 2],
      ['غرفتان', 2],
      ['اوضتين', 2],
      ['غرفه واحده', 1],
      ['غرفة واحدة', 1],
    ]),
    bathrooms: extractIntegerFilter(normalized, [
      /(\d+)\s*(?:bathroom|bathrooms|bath|baths|حمام|حمامات)/i,
      /(?:bathroom|bathrooms|bath|baths|حمام|حمامات)\s*(\d+)/i,
    ]) ?? extractArabicImplicitCount(normalized, [
      ['حمامين', 2],
      ['حمام واحد', 1],
    ]),
    floor: extractIntegerFilter(normalized, [
      /(\d+)\s*(?:floor|دور|طابق)/i,
      /(?:floor|دور|طابق)\s*(\d+)/i,
    ]),
    peopleCount: extractPeopleCount(normalized),
    verifiedPref: containsAny(normalized, ['verified', 'trusted', 'موثق', 'موثقة', 'مضمون', 'مؤكد']),
    ratingPref: containsAny(normalized, ['best', 'top rated', 'highest rated', 'افضل', 'أفضل', 'اعلى تقييم', 'أعلى تقييم', 'تقييم عالي']),
    minRating: containsAny(normalized, ['best', 'top rated', 'highest rated', 'اعلى تقييم', 'أعلى تقييم', 'تقييم عالي']) ? 4 : null,
  };
}

function extractArabicImplicitCount(normalized, pairs) {
  for (const [word, count] of pairs) {
    if (normalized.includes(normalizeSearchText(word))) return count;
  }
  return null;
}

function extractPeopleCount(normalized) {
  const wordCounts = { شخص: 1, شخصين: 2, فرد: 1, فردين: 2, طالبين: 2, اتنين: 2, اثنين: 2, تلاته: 3, ثلاثة: 3 };
  for (const [word, count] of Object.entries(wordCounts)) {
    if (normalized.includes(normalizeSearchText(word))) return count;
  }
  return extractIntegerFilter(normalized, [
    /(\d+)\s*(?:people|persons|students|افراد|اشخاص|أشخاص|طلاب|طالب|فرد)/i,
    /(?:for|capacity|fit|ل|يكفي|يناسب)\s*(\d+)\s*(?:people|persons|students|افراد|اشخاص|طلاب|طالب|فرد)?/i,
  ]);
}

function extractQueryHints(message) {
  const normalized = normalizeForMatch(message);
  const hints = [];
  if (containsAny(normalized, ['furnished', 'fully furnished', 'مفروش', 'مفروشه'])) hints.push('furnished');
  if (containsAny(normalized, ['university', 'جامعة', 'جامعه', 'near university', 'قريبة من الجامعة'])) hints.push('university');
  if (containsAny(normalized, ['quiet', 'هادئ', 'هادي'])) hints.push('quiet');
  if (containsAny(normalized, ['clean', 'نظيف', 'نضيف'])) hints.push('clean');
  if (containsAny(normalized, ['wifi', 'internet', 'واي فاي', 'انترنت'])) hints.push('internet');
  return hints.length > 0 ? hints.join(' ') : null;
}

function clarifyQuestion(message, filters = {}) {
  const arabic = /[\u0600-\u06ff]/.test(message);
  if (!filters.district && (filters.minPrice != null || filters.maxPrice != null)) {
    return arabic ? 'تمام، تحب الشقة في أي منطقة؟' : 'Which district do you prefer?';
  }
  if (filters.district && filters.minPrice == null && filters.maxPrice == null) {
    return arabic ? 'تمام، الميزانية الشهرية كام تقريباً؟' : 'What monthly budget should I search within?';
  }
  return arabic
    ? 'تحب في أي منطقة؟ والميزانية الشهرية كام تقريباً؟'
    : 'Which district and monthly budget should I search for?';
}

function buildLocalFilters(message, seedFilters = {}, options = {}) {
  const districtInfo = extractDistrict(message, options);
  const priceInfo = extractPriceFilter(message);
  const featureFilters = extractFeatureFilters(message);
  const filters = {
    propertyType: seedFilters.propertyType || detectPropertyType(message),
    district: seedFilters.district || districtInfo.district,
    districtVariants:
      Array.isArray(seedFilters.districtVariants) && seedFilters.districtVariants.length > 0
        ? unique(seedFilters.districtVariants)
        : districtInfo.districtVariants,
    districtMatchConfidence: districtInfo.districtMatchConfidence || 0,
    minPrice: seedFilters.minPrice != null ? Number(seedFilters.minPrice) : priceInfo.minPrice,
    maxPrice: seedFilters.maxPrice != null ? Number(seedFilters.maxPrice) : priceInfo.maxPrice,
    priceOperator: seedFilters.priceOperator || priceInfo.priceOperator,
    bedrooms: seedFilters.bedrooms ?? seedFilters.rooms ?? featureFilters.bedrooms,
    bathrooms: seedFilters.bathrooms ?? featureFilters.bathrooms,
    floor: seedFilters.floor ?? featureFilters.floor,
    peopleCount: seedFilters.peopleCount ?? featureFilters.peopleCount,
    ratingPref: Boolean(seedFilters.ratingPref ?? featureFilters.ratingPref),
    verifiedPref: Boolean(seedFilters.verifiedPref ?? featureFilters.verifiedPref),
    minRating: seedFilters.minRating ?? featureFilters.minRating,
    query: seedFilters.query || extractQueryHints(message),
  };

  if (filters.district) {
    const resolvedDistrict = canonicalizeDistrict(filters.district, options.districts);
    filters.district = resolvedDistrict.district;
    filters.districtVariants = unique([...filters.districtVariants, ...resolvedDistrict.districtVariants]);
    filters.districtMatchConfidence = Math.max(filters.districtMatchConfidence, resolvedDistrict.districtMatchConfidence);
  }

  if (!filters.priceOperator) {
    if (filters.minPrice != null && filters.maxPrice != null) filters.priceOperator = 'between';
    else if (filters.minPrice != null) filters.priceOperator = 'gt';
    else if (filters.maxPrice != null) filters.priceOperator = 'lt';
  }

  return filters;
}

function needsClarification(message, filters) {
  if (filters.priceOperator === 'between' && (filters.minPrice == null || filters.maxPrice == null)) return true;

  const hasDistrict = Boolean(filters.district);
  const hasBudget = filters.minPrice != null || filters.maxPrice != null;
  const hasSpecificFilters = Boolean(filters.bedrooms || filters.bathrooms || filters.floor || filters.peopleCount || filters.query || filters.verifiedPref || filters.ratingPref);
  if (hasDistrict && (hasBudget || hasSpecificFilters)) return false;
  if (hasBudget && hasSpecificFilters) return false;

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

function normalizeParseIntent(value) {
  return VALID_PARSE_INTENTS.includes(value) ? value : 'not_apartment_search';
}

function normalizeOpenAIResult(result, message, options = {}) {
  const parsed = result || {};
  const localFilters = buildLocalFilters(message, {}, options);
  return buildLocalFilters(message, {
    propertyType: typeof parsed.propertyType === 'string' && parsed.propertyType.trim() ? parsed.propertyType.trim().toLowerCase() : localFilters.propertyType,
    district: typeof parsed.district === 'string' && parsed.district.trim() ? parsed.district.trim() : localFilters.district,
    districtVariants: Array.isArray(parsed.districtVariants) ? parsed.districtVariants.map((item) => String(item).trim()).filter(Boolean) : localFilters.districtVariants,
    minPrice: parseNumber(parsed.minPrice) ?? localFilters.minPrice,
    maxPrice: parseNumber(parsed.maxPrice) ?? localFilters.maxPrice,
    priceOperator: ['gt', 'lt', 'between'].includes(parsed.priceOperator) ? parsed.priceOperator : localFilters.priceOperator,
    bedrooms: parseNumber(parsed.bedrooms) ?? parseNumber(parsed.rooms) ?? localFilters.bedrooms,
    bathrooms: parseNumber(parsed.bathrooms) ?? localFilters.bathrooms,
    floor: parseNumber(parsed.floor) ?? localFilters.floor,
    peopleCount: parseNumber(parsed.peopleCount) ?? localFilters.peopleCount,
    ratingPref: parsed.ratingPref ?? localFilters.ratingPref,
    verifiedPref: parsed.verifiedPref ?? localFilters.verifiedPref,
    minRating: parseNumber(parsed.minRating) ?? localFilters.minRating,
    query: typeof parsed.query === 'string' && parsed.query.trim() ? parsed.query.trim() : localFilters.query,
  }, options);
}

async function parseApartmentSearch(message, seedFilters = {}, options = {}) {
  const text = String(message || '').trim();
  const seeded = buildLocalFilters(text, seedFilters, options);

  if (!text) {
    return {
      source: 'rules',
      detectedIntent: 'search_apartment',
      filters: seeded,
      needsClarification: true,
      clarificationQuestion: clarifyQuestion(text, seeded),
    };
  }

  if (openai) {
    try {
      const parsed = await openaiParse(text, options);
      const detectedIntent = normalizeParseIntent(parsed.intent);
      if (detectedIntent !== 'search_apartment') {
        return {
          source: 'openai',
          detectedIntent,
          filters: seeded,
          needsClarification: false,
          clarificationQuestion: null,
          confidence: Number(parsed.confidence) || 0,
          reason: typeof parsed.reason === 'string' ? parsed.reason : null,
        };
      }

      const filters = normalizeOpenAIResult(parsed, text, options);
      const clarification = Boolean(parsed.needsClarification) || needsClarification(text, filters);
      return {
        source: 'openai',
        detectedIntent,
        filters,
        needsClarification: clarification,
        clarificationQuestion:
          typeof parsed.clarificationQuestion === 'string' && parsed.clarificationQuestion.trim()
            ? parsed.clarificationQuestion.trim()
            : clarification
              ? clarifyQuestion(text, filters)
              : null,
        confidence: Number(parsed.confidence) || 0,
        reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'OpenAI apartment parsing failed, using rule-based parser');
    }
  }

  const isSearch = inferLocalSearchIntent(text, seeded);
  if (!isSearch) {
    return {
      source: 'rules',
      detectedIntent: 'not_apartment_search',
      filters: seeded,
      needsClarification: false,
      clarificationQuestion: null,
      confidence: 0.7,
      reason: 'Offline parser did not find an apartment-search request.',
    };
  }

  const clarification = needsClarification(text, seeded);
  return {
    source: 'rules',
    detectedIntent: 'search_apartment',
    filters: seeded,
    needsClarification: clarification,
    clarificationQuestion: clarification ? clarifyQuestion(text, seeded) : null,
    confidence: 0.65,
    reason: 'Offline parser inferred apartment search from housing intent or filters.',
  };
}

async function openaiParse(message, options = {}) {
  const configuredDistricts = (options.districts || []).filter(Boolean).join(', ') || 'فريال, سيتي, سيد, الجمهوريه, يسري راغب, آخر';
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
  "intent": "search_apartment" | "not_apartment_search",
  "confidence": number,
  "reason": string | null,
  "propertyType": "apartment" | "room" | null,
  "district": string | null,
  "districtVariants": string[],
  "minPrice": number | null,
  "maxPrice": number | null,
  "priceOperator": "gt" | "lt" | "between" | null,
  "bedrooms": number | null,
  "bathrooms": number | null,
  "floor": number | null,
  "peopleCount": number | null,
  "ratingPref": boolean,
  "verifiedPref": boolean,
  "minRating": number | null,
  "query": string | null,
  "needsClarification": boolean,
  "clarificationQuestion": string | null
}
Configured districts from the database: ${configuredDistricts}.
Decide intent semantically from the user's meaning, not from fixed keywords.
Use "search_apartment" only when the user wants housing/apartment/room search, comparison, filtering, or recommendations.
Use "not_apartment_search" for greetings, support requests, booking-policy questions, account questions, small talk, or unrelated messages.
Normalize district names to the closest configured district when possible.
Common examples: Ferial/Faryal -> فريال, City -> سيتي, Sayed/Sidi -> سيد, El Gomhoria -> الجمهوريه, Yosry Ragheb -> يسري راغب, Other -> آخر.
For more than / greater than / اكتر من / اكثر من / فوق, set priceOperator to gt and fill minPrice.
For less than / under / اقل من / أقل من / تحت, set priceOperator to lt and fill maxPrice.
For between / from ... to ... / من ... ل ..., set priceOperator to between and fill both minPrice and maxPrice.
Extract bedrooms, bathrooms, floor, people/capacity, verified preference, rating preference, and feature words like furnished or near university.
If the request is a housing search but is missing both location and budget/specific filters, ask a short follow-up in the same language as the user.
The "reason" field must be a short decision summary, not step-by-step reasoning.`,
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
  buildDistrictCatalog,
};
