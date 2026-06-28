jest.mock('../src/models/apartment.model', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  distinct: jest.fn(),
}));

jest.mock('../src/models/booking.model', () => ({
  countDocuments: jest.fn(),
}));

jest.mock('../src/models/user.model', () => ({
  countDocuments: jest.fn(),
}));

const Apartment = require('../src/models/apartment.model');
const db = require('../src/services/aiDatabaseService');

describe('aiDatabaseService searchApartments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses all district variants and strict greater-than price filtering', async () => {
    Apartment.find.mockReturnValueOnce({
      lean: jest.fn(async () => [
        {
          id: 'apt-city-1',
          name: 'City apartment',
          price: 1500,
          district: 'سيتي',
          city: 'Assuit',
          available_people: 1,
        },
      ]),
    });

    const result = await db.searchApartments({
      location: 'سيتي',
      locationVariants: ['سيتي', 'city', 'sity'],
      priceMin: 1000,
      priceOperator: 'gt',
    });

    const mongoFilter = Apartment.find.mock.calls[0][0];
    const locationCondition = mongoFilter.$and.find((condition) => Array.isArray(condition.$or));
    const priceCondition = mongoFilter.$and.find((condition) => condition.price?.$gt === 1000);

    expect(priceCondition).toEqual({ price: { $gt: 1000 } });
    expect(locationCondition.$or.some((condition) => condition.district?.test('سيتي'))).toBe(true);
    expect(locationCondition.$or.some((condition) => condition.district?.test('city'))).toBe(true);
    expect(result.apartments).toHaveLength(1);
    expect(result.mongoFilter).toBe(mongoFilter);
  });
});
