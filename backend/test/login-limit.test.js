// Wrong-password limiter: 5 failures lock login; a correct login resets.
process.env.LOGIN_MAX_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MINUTES = '0.02'; // 1.2 seconds, so the test can wait it out

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, TEST_PASSWORD } = require('./helpers');

let app;
before(async () => { ({ app } = await setup()); });
after(teardown);

const attempt = (password) => request(app).post('/api/auth/login').send({ password });

describe('login attempt limit', () => {
  it('says how many attempts are left', async () => {
    const res = await attempt('wrong');
    assert.equal(res.status, 401);
    assert.match(res.body.message, /4 attempts left/);
    await attempt(TEST_PASSWORD); // reset
  });

  it('a correct login resets the count', async () => {
    for (let i = 0; i < 4; i++) assert.equal((await attempt('wrong')).status, 401);
    assert.equal((await attempt(TEST_PASSWORD)).status, 200);
    // 4 more wrong ones are allowed again
    for (let i = 0; i < 4; i++) assert.equal((await attempt('wrong')).status, 401);
    assert.equal((await attempt(TEST_PASSWORD)).status, 200);
  });

  it('locks after 5 wrong passwords — even the right password is refused until it expires', async () => {
    for (let i = 0; i < 4; i++) assert.equal((await attempt('wrong')).status, 401);
    const fifth = await attempt('wrong');
    assert.equal(fifth.status, 429);
    assert.match(fifth.body.message, /Too many wrong passwords/);
    assert.ok(Number(fifth.headers['retry-after']) >= 1);

    const blocked = await attempt(TEST_PASSWORD);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.token, undefined);

    // Missing password also counts as blocked, not as a fresh failure
    assert.equal((await attempt(undefined)).status, 429);

    await new Promise(r => setTimeout(r, 1400));
    const after = await attempt(TEST_PASSWORD);
    assert.equal(after.status, 200);
    assert.ok(after.body.token);
  });

  it('a non-string password is handled safely', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: { $gt: '' } });
    assert.equal(res.status, 401);
    await attempt(TEST_PASSWORD);
  });
});
