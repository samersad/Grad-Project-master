const request = require('supertest');

jest.mock('../src/services/aiIntentService', () => ({
  detectIntentAndEntities: jest.fn(async () => ({
    intent: 'search_apartment',
    entities: {},
  })),
  isArabicMessage: jest.fn(() => true),
}));

jest.mock('../src/services/aiApartmentSearchParser', () => ({
  parseApartmentSearch: jest.fn(async () => ({
    source: 'rules',
    detectedIntent: 'search_apartment',
    filters: {
      propertyType: 'apartment',
      district: 'فريال',
      districtVariants: ['فريال', 'فرياال', 'Ferial', 'Faryal'],
      minPrice: 1000,
      maxPrice: null,
      priceOperator: 'gt',
      query: null,
    },
    needsClarification: false,
    clarificationQuestion: null,
  })),
}));

jest.mock('../src/services/aiApartmentService', () => ({
  searchApartments: jest.fn(async () => ({
    apartments: [
      {
        id: 'apt-1',
        name: 'Ferial View',
        price: 1500,
        city: 'Assuit',
        district: 'فريال',
        bedrooms: 2,
        available_people: 1,
        rating_average: 4.5,
        verified: true,
      },
    ],
    isFallback: false,
    mongoFilter: { mocked: true },
    searchFilters: { mocked: true },
  })),
}));

jest.mock('../src/services/aiDatabaseService', () => ({
  getSearchMetadata: jest.fn(async () => ({
    districts: ['فريال', 'سيتي', 'سيد', 'الجمهوريه', 'يسري راغب', 'آخر'],
    cities: ['Assuit'],
  })),
  getPlatformStats: jest.fn(async () => ({
    totalBookings: 0,
    activeBookings: 0,
    availableApartments: 1,
    cities: ['Assuit'],
  })),
}));

jest.mock('../src/services/aiOpenaiService', () => ({
  generateChatResponse: jest.fn(async () => 'لقيتلك شقة مناسبة.'),
}));

jest.mock('../src/services/aiFaqService', () => ({
  getFaqAnswer: jest.fn(async () => ({ answer: '', stats: null })),
}));

const app = require('../src/app');

describe('chatbot search route', () => {
  it('returns matched apartments for a structured Arabic search', async () => {
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({ message: 'انا عاوز شقة سعرها اكتر من 1000 في فرياال' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.intent).toBe('search_apartment');
    expect(res.body.needsClarification).toBe(false);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.searchFilters.district).toBe('فريال');
    expect(res.body.searchFilters.minPrice).toBe(1000);
    expect(res.body.reply).toContain('شقة');
  });

  it('asks a follow-up when the request is too vague', async () => {
    const parser = require('../src/services/aiApartmentSearchParser');
    parser.parseApartmentSearch.mockResolvedValueOnce({
      source: 'rules',
      detectedIntent: 'search_apartment',
      filters: {
        propertyType: 'apartment',
        district: null,
        districtVariants: [],
        minPrice: null,
        maxPrice: null,
        priceOperator: null,
        query: null,
      },
      needsClarification: true,
      clarificationQuestion: 'هل تريد البحث في حي معين أو بسعر محدد؟',
    });

    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({ message: 'عاوز شقة' });

    expect(res.statusCode).toBe(200);
    expect(res.body.needsClarification).toBe(true);
    expect(res.body.suggestions).toEqual([]);
    expect(res.body.reply).toContain('حي معين');
  });
});
