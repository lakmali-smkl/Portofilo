const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, request, PNG_1X1 } = require('./helpers');

let app;
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  ({ app } = await setup());
  token = await login(app);
});
after(teardown);

describe('profile', () => {
  it('seeds a default profile', async () => {
    const res = await request(app).get('/api/profile');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Kasunika');
    assert.equal(res.body.data.photo, null);
  });

  it('requires login to update', async () => {
    const res = await request(app).post('/api/profile').send({ name: 'Hacker' });
    assert.equal(res.status, 401);
    assert.equal((await request(app).get('/api/profile')).body.data.name, 'Kasunika');
  });

  it('updates provided fields, trims them, and keeps the rest', async () => {
    const before = (await request(app).get('/api/profile')).body.data;
    const res = await request(app).post('/api/profile').set(auth())
      .send({ email: '  me@example.com ', github: 'https://github.com/me' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data._id, undefined);

    const after = (await request(app).get('/api/profile')).body.data;
    assert.equal(after.email, 'me@example.com');
    assert.equal(after.github, 'https://github.com/me');
    assert.equal(after.name, before.name);
    assert.equal(after.bio, before.bio);
    assert.ok(after.updatedAt);
  });

  it('keeps a single profile document after repeated saves', async () => {
    const { Profile } = require('../models');
    await request(app).post('/api/profile').set(auth()).send({ name: 'A' });
    await request(app).post('/api/profile').set(auth()).send({ name: 'B' });
    assert.equal(await Profile.countDocuments(), 1);
    assert.equal((await request(app).get('/api/profile')).body.data.name, 'B');
  });

  it('uploads a photo and replaces (deletes) the previous one', async () => {
    const first = await request(app).post('/api/profile').set(auth())
      .attach('photo', PNG_1X1, { filename: 'me.png', contentType: 'image/png' });
    assert.equal(first.status, 200);
    const firstPhoto = first.body.data.photo;
    assert.match(firstPhoto, /^\/api\/images\//);
    assert.equal((await request(app).get(firstPhoto)).status, 200);

    const second = await request(app).post('/api/profile').set(auth())
      .field('name', 'Kasunika')
      .attach('photo', PNG_1X1, { filename: 'me2.jpg', contentType: 'image/jpeg' });
    assert.equal(second.status, 200);
    assert.notEqual(second.body.data.photo, firstPhoto);
    assert.equal((await request(app).get(firstPhoto)).status, 404);
    assert.equal((await request(app).get(second.body.data.photo)).status, 200);
  });
});
