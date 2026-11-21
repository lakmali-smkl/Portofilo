const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, request } = require('./helpers');

let app;
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  ({ app } = await setup());
  token = await login(app);
});
after(teardown);

const valid = { name: 'Visitor', email: 'visitor@example.com', message: 'Hello there!' };

describe('POST /api/contact (public)', () => {
  it('saves a valid message without login (email off when SMTP is not configured)', async () => {
    const original = console.log;
    console.log = () => {}; // silence the "email notifications are OFF" notice
    let res;
    try {
      res = await request(app).post('/api/contact').send({ ...valid, name: '  Visitor  ' });
    } finally {
      console.log = original;
    }
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.emailSent, false);
    assert.equal(res.body.data.name, 'Visitor');
    assert.ok(res.body.data.id);
  });

  for (const field of ['name', 'email', 'message']) {
    it(`requires ${field}`, async () => {
      const res = await request(app).post('/api/contact').send({ ...valid, [field]: '' });
      assert.equal(res.status, 400);
    });

    it(`rejects a whitespace-only ${field}`, async () => {
      const res = await request(app).post('/api/contact').send({ ...valid, [field]: '   ' });
      assert.equal(res.status, 400);
    });
  }

  it('rejects an invalid email address', async () => {
    for (const email of ['not-an-email', 'a@b', 'a b@c.com', '@example.com']) {
      const res = await request(app).post('/api/contact').send({ ...valid, email });
      assert.equal(res.status, 400, `${email} should be rejected`);
      assert.match(res.body.message, /valid email/);
    }
  });
});

describe('messages inbox (owner only)', () => {
  it('requires login to read or delete', async () => {
    assert.equal((await request(app).get('/api/messages')).status, 401);
    assert.equal((await request(app).delete('/api/messages/x')).status, 401);
  });

  it('lists messages newest first and deletes them', async () => {
    await request(app).post('/api/contact').send({ ...valid, message: 'first' });
    await new Promise(r => setTimeout(r, 5));
    await request(app).post('/api/contact').send({ ...valid, message: 'second' });

    const list = await request(app).get('/api/messages').set(auth());
    assert.equal(list.status, 200);
    assert.equal(list.body.data[0].message, 'second');

    const id = list.body.data[0].id;
    const del = await request(app).delete(`/api/messages/${id}`).set(auth());
    assert.equal(del.status, 200);
    assert.equal((await request(app).delete(`/api/messages/${id}`).set(auth())).status, 404);

    const after = await request(app).get('/api/messages').set(auth());
    assert.equal(after.body.data.length, list.body.data.length - 1);
  });
});
