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

describe('seeded defaults', () => {
  const expected = { skills: 18, education: 2, experience: 4, certificates: 3, events: 0 };
  for (const [name, count] of Object.entries(expected)) {
    it(`/api/${name} is public and has ${count} seeded items`, async () => {
      const res = await request(app).get(`/api/${name}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, count);
    });
  }

  it('/api/research is private (owner only)', async () => {
    assert.equal((await request(app).get('/api/research')).status, 401);
    const res = await request(app).get('/api/research').set(auth());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  });
});

describe('generic resource CRUD', () => {
  for (const name of ['skills', 'education', 'experience', 'certificates', 'events', 'research']) {
    describe(`/api/${name}`, () => {
      it('requires login for writes', async () => {
        assert.equal((await request(app).post(`/api/${name}`).send({ title: 'x' })).status, 401);
        assert.equal((await request(app).put(`/api/${name}/x`).send({ title: 'x' })).status, 401);
        assert.equal((await request(app).delete(`/api/${name}/x`)).status, 401);
      });

      it('requires a non-blank title', async () => {
        assert.equal((await request(app).post(`/api/${name}`).set(auth()).send({})).status, 400);
        assert.equal((await request(app).post(`/api/${name}`).set(auth()).send({ title: '  ' })).status, 400);
      });

      it('creates, updates and deletes an item', async () => {
        const created = await request(app).post(`/api/${name}`).set(auth())
          .send({ title: ' New item ', description: 'desc' });
        assert.equal(created.status, 201);
        const item = created.body.data;
        assert.equal(item.title, 'New item');
        assert.ok(item.id && item.createdAt);

        const updated = await request(app).put(`/api/${name}/${item.id}`).set(auth())
          .send({ description: 'changed' });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.data.title, 'New item');
        assert.equal(updated.body.data.description, 'changed');
        assert.equal(updated.body.data.id, item.id);

        const list = (await request(app).get(`/api/${name}`).set(auth())).body.data;
        assert.equal(list.find(x => x.id === item.id).description, 'changed');

        assert.equal((await request(app).delete(`/api/${name}/${item.id}`).set(auth())).status, 200);
        assert.equal((await request(app).delete(`/api/${name}/${item.id}`).set(auth())).status, 404);
        assert.equal((await request(app).put(`/api/${name}/${item.id}`).set(auth()).send({ title: 'x' })).status, 404);
      });
    });
  }
});

describe('field handling', () => {
  it('ignores a client-supplied id', async () => {
    const res = await request(app).post('/api/events').set(auth()).send({ title: 'E', id: 'chosen-id' });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.data.id, 'chosen-id');

    const upd = await request(app).put(`/api/events/${res.body.data.id}`).set(auth()).send({ id: 'other' });
    assert.equal(upd.body.data.id, res.body.data.id);
  });

  it('parses tags from a comma list or JSON array', async () => {
    const a = await request(app).post('/api/education').set(auth()).send({ title: 'A', tags: 'x, y,,z' });
    assert.deepEqual(a.body.data.tags, ['x', 'y', 'z']);
    const b = await request(app).post('/api/experience').set(auth()).send({ title: 'B', tags: '["p, q","r"]' });
    assert.deepEqual(b.body.data.tags, ['p, q', 'r']);
  });

  it('clamps skill level to 0-100 and drops a blank level', async () => {
    const hi = await request(app).post('/api/skills').set(auth()).send({ title: 'Hi', level: '150' });
    assert.equal(hi.body.data.level, 100);
    const lo = await request(app).post('/api/skills').set(auth()).send({ title: 'Lo', level: '-5' });
    assert.equal(lo.body.data.level, 0);
    const nan = await request(app).post('/api/skills').set(auth()).send({ title: 'NaN', level: 'abc' });
    assert.equal(nan.body.data.level, 0);

    const upd = await request(app).put(`/api/skills/${hi.body.data.id}`).set(auth()).send({ level: '' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.level, undefined);
    const stored = (await request(app).get('/api/skills')).body.data.find(s => s.id === hi.body.data.id);
    assert.equal(stored.level, undefined);
  });

  it('parses multipart text fields even for resources without images (skills)', async () => {
    const res = await request(app).post('/api/skills').set(auth())
      .field('title', 'Rust').field('level', '40')
      .attach('image', PNG_1X1, { filename: 'x.png', contentType: 'image/png' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.title, 'Rust');
    assert.equal(res.body.data.level, 40);
    assert.equal(res.body.data.image, undefined); // skills never store an image
  });

  it('stores, replaces and deletes images for image resources', async () => {
    const created = await request(app).post('/api/certificates').set(auth())
      .field('title', 'Cert')
      .attach('image', PNG_1X1, { filename: 'c.png', contentType: 'image/png' });
    const firstImage = created.body.data.image;
    assert.match(firstImage, /^\/api\/images\//);

    const updated = await request(app).put(`/api/certificates/${created.body.data.id}`).set(auth())
      .field('keepImages', '[]')
      .attach('images', PNG_1X1, { filename: 'd.png', contentType: 'image/png' });
    const secondImage = updated.body.data.image;
    assert.notEqual(secondImage, firstImage);
    assert.equal((await request(app).get(firstImage)).status, 404);

    // Updating without a new file keeps the current image
    const kept = await request(app).put(`/api/certificates/${created.body.data.id}`).set(auth())
      .send({ description: 'x' });
    assert.equal(kept.body.data.image, secondImage);

    await request(app).delete(`/api/certificates/${created.body.data.id}`).set(auth());
    assert.equal((await request(app).get(secondImage)).status, 404);
  });
});
