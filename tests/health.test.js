const request = require('supertest');
const app = require('../src/app');

describe('health', () => {
  it('returns API health status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
