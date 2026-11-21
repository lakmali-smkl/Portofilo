const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { setup, teardown, login, request, TEST_PASSWORD, TEST_JWT_SECRET } = require('./helpers');

let app;
before(async () => { ({ app } = await setup()); });
after(teardown);

describe('GET /api/health', () => {
  it('reports the API is up', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.port, 3001);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a JWT for the correct password', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const payload = jwt.verify(res.body.token, TEST_JWT_SECRET);
    assert.equal(payload.role, 'owner');
    // Expires in 7 days
    assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'nope' });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.token, undefined);
  });

  it('rejects a missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    assert.equal(res.status, 401);
  });
});

describe('requireAuth / GET /api/auth/verify', () => {
  it('accepts a valid token', async () => {
    const token = await login(app);
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/verify');
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Login required.');
  });

  it('requires the "Bearer " scheme', async () => {
    const token = await login(app);
    const res = await request(app).get('/api/auth/verify').set('Authorization', token);
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Login required.');
  });

  it('rejects a token signed with another secret', async () => {
    const forged = jwt.sign({ role: 'owner' }, 'some-other-secret');
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${forged}`);
    assert.equal(res.status, 401);
    assert.match(res.body.message, /Session expired/);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ role: 'owner', exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET);
    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${expired}`);
    assert.equal(res.status, 401);
  });

  it('rejects garbage', async () => {
    const res = await request(app).get('/api/auth/verify').set('Authorization', 'Bearer not.a.jwt');
    assert.equal(res.status, 401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('requires login', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'whatever123' });
    assert.equal(res.status, 401);
  });

  it('returns 400 (not 401) for a wrong current password, so the frontend does not log out', async () => {
    const token = await login(app);
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'whatever123' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Current password is incorrect/);
  });

  it('rejects a new password shorter than 6 characters', async () => {
    const token = await login(app);
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: '12345' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /at least 6/);
  });

  it('changes the password, persists it, and keeps existing sessions valid', async () => {
    const { Auth } = require('../models');
    const bcrypt = require('bcryptjs');
    const token = await login(app);

    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'brand-new-pass' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Old password no longer works, new one does
    assert.equal((await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ password: 'brand-new-pass' })).status, 200);

    // Saved to the database, not just in memory
    const stored = await Auth.findOne({}).lean();
    assert.ok(bcrypt.compareSync('brand-new-pass', stored.passwordHash));

    // The token issued before the change still works
    const verify = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);
    assert.equal(verify.status, 200);

    // Restore for any later tests
    await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'brand-new-pass', newPassword: TEST_PASSWORD });
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /not found/);
  });
});

describe('CORS', () => {
  it('allows the local frontend origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:8000');
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:8000');
  });

  it('does not allow other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});
