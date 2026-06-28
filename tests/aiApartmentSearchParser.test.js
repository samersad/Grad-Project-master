const { parseApartmentSearch } = require('../src/services/aiApartmentSearchParser');

describe('aiApartmentSearchParser', () => {
  it('parses Arabic greater-than search with district normalization', async () => {
    const result = await parseApartmentSearch('انا عاوز شقه سعرها اكتر من 1000 في فرياال');

    expect(result.needsClarification).toBe(false);
    expect(result.filters.propertyType).toBe('apartment');
    expect(result.filters.district).toBe('فريال');
    expect(result.filters.minPrice).toBe(1000);
    expect(result.filters.maxPrice).toBeNull();
    expect(result.filters.priceOperator).toBe('gt');
  });

  it('parses Arabic between search', async () => {
    const result = await parseApartmentSearch('هاتلي شقق من 1000 ل 3000 في فريال');

    expect(result.needsClarification).toBe(false);
    expect(result.filters.district).toBe('فريال');
    expect(result.filters.minPrice).toBe(1000);
    expect(result.filters.maxPrice).toBe(3000);
    expect(result.filters.priceOperator).toBe('between');
  });

  it('parses English under search with district normalization', async () => {
    const result = await parseApartmentSearch('show me apartments in Ferial under 5000');

    expect(result.needsClarification).toBe(false);
    expect(result.filters.district).toBe('فريال');
    expect(result.filters.minPrice).toBeNull();
    expect(result.filters.maxPrice).toBe(5000);
    expect(result.filters.priceOperator).toBe('lt');
  });

  it.each([
    ['show me apartments in City under 5000', 'سيتي'],
    ['عايز شقة في سيد سعرها أقل من 5000', 'سيد'],
    ['هاتلي شقق في الجمهورية من 1000 ل 3000', 'الجمهوريه'],
    ['I need an apartment in Yosry Ragheb price more than 1000', 'يسري راغب'],
    ['عايز شقة في اخر تحت 4000', 'آخر'],
  ])('normalizes configured district aliases from "%s"', async (message, district) => {
    const result = await parseApartmentSearch(message);

    expect(result.needsClarification).toBe(false);
    expect(result.filters.district).toBe(district);
    expect(result.filters.districtVariants).toEqual(expect.arrayContaining([district]));
  });

  it('does not treat university as City district', async () => {
    const result = await parseApartmentSearch('show me apartments near university under 5000');

    expect(result.filters.district).toBeNull();
    expect(result.filters.maxPrice).toBe(5000);
  });

  it('extracts extra client search filters', async () => {
    const result = await parseApartmentSearch('عايز شقة غرفتين وحمامين في سيتي تحت 5000 موثقة');

    expect(result.needsClarification).toBe(false);
    expect(result.filters.district).toBe('سيتي');
    expect(result.filters.bedrooms).toBe(2);
    expect(result.filters.bathrooms).toBe(2);
    expect(result.filters.maxPrice).toBe(5000);
    expect(result.filters.verifiedPref).toBe(true);
  });

  it('matches dynamic districts with fuzzy spelling', async () => {
    const result = await parseApartmentSearch(
      'show me apartments in Nasr Cty under 6000',
      {},
      { districts: ['Nasr City'] },
    );

    expect(result.needsClarification).toBe(false);
    expect(result.filters.district).toBe('Nasr City');
    expect(result.filters.maxPrice).toBe(6000);
  });

  it('asks for clarification when filters are missing', async () => {
    const result = await parseApartmentSearch('عاوز شقة');

    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toBeTruthy();
  });

  it('does not classify greetings as apartment searches', async () => {
    const result = await parseApartmentSearch('ازيك');

    expect(result.detectedIntent).toBe('not_apartment_search');
    expect(result.needsClarification).toBe(false);
  });
});
