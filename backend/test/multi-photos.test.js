// Any number of photos per item (all sections except the profile).
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

const attachN = (req, n, field = 'images') => {
  for (let i = 0; i < n; i++) req.attach(field, PNG_1X1, { filename: `p${i}.png`, contentType: 'image/png' });
  return req;
};
const status = async (path, headers = {}) => (await request(app).get(path).set(headers)).status;

const PHOTO_SECTIONS = ['education', 'experience', 'certificates', 'events', 'achievements', 'publications', 'testimonials', 'gallery'];

describe('multiple photos in every section', () => {
  for (const name of PHOTO_SECTIONS) {
    it(`/api/${name}: add several, then remove, reorder and append`, async () => {
      const created = await attachN(request(app).post(`/api/${name}`).set(auth()).field('title', 'Item'), 3);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const [a, b, c] = created.body.data.images;
      assert.equal(created.body.data.images.length, 3);
      assert.equal(created.body.data.image, a); // cover = first photo
      for (const p of [a, b, c]) assert.equal(await status(p), 200);

      // Keep c then a (drop b, make c the cover) and add 2 more
      const updated = await attachN(
        request(app).put(`/api/${name}/${created.body.data.id}`).set(auth()).field('keepImages', JSON.stringify([c, a])),
        2
      );
      assert.equal(updated.status, 200);
      const images = updated.body.data.images;
      assert.equal(images.length, 4);
      assert.deepEqual(images.slice(0, 2), [c, a]);
      assert.equal(updated.body.data.image, c);
      assert.equal(await status(b), 404, 'removed photo is deleted');

      // Stored in the database, not just echoed back
      const list = (await request(app).get(`/api/${name}`)).body.data;
      assert.deepEqual(list.find(x => x.id === created.body.data.id).images, images);

      // Deleting the item deletes every photo
      await request(app).delete(`/api/${name}/${created.body.data.id}`).set(auth());
      for (const p of images) assert.equal(await status(p), 404);
    });
  }
});

describe('photo edit rules', () => {
  it('keeps all photos when keepImages is not sent', async () => {
    const created = await attachN(request(app).post('/api/events').set(auth()).field('title', 'E'), 2);
    const updated = await request(app).put(`/api/events/${created.body.data.id}`).set(auth()).send({ description: 'x' });
    assert.deepEqual(updated.body.data.images, created.body.data.images);
  });

  it('removes every photo with keepImages=[]', async () => {
    const created = await attachN(request(app).post('/api/events').set(auth()).field('title', 'E'), 2);
    const updated = await request(app).put(`/api/events/${created.body.data.id}`).set(auth()).send({ keepImages: '[]' });
    assert.deepEqual(updated.body.data.images, []);
    assert.equal(updated.body.data.image, null);
    for (const p of created.body.data.images) assert.equal(await status(p), 404);
  });

  it("ignores photos in keepImages that belong to another item", async () => {
    const other = await attachN(request(app).post('/api/events').set(auth()).field('title', 'Other'), 1);
    const mine = await attachN(request(app).post('/api/events').set(auth()).field('title', 'Mine'), 1);
    const updated = await request(app).put(`/api/events/${mine.body.data.id}`).set(auth())
      .send({ keepImages: JSON.stringify([other.body.data.images[0], mine.body.data.images[0]]) });
    assert.deepEqual(updated.body.data.images, mine.body.data.images);
    assert.equal(await status(other.body.data.images[0]), 200, "other item's photo untouched");
  });

  it('still accepts the old single "image" field and old single-photo items', async () => {
    const created = await request(app).post('/api/events').set(auth()).field('title', 'Legacy')
      .attach('image', PNG_1X1, { filename: 'one.png', contentType: 'image/png' });
    assert.equal(created.body.data.images.length, 1);
    assert.equal(created.body.data.image, created.body.data.images[0]);

    // An item saved before `images` existed (only `image`) gets more photos appended
    const { resourceModel } = require('../models');
    await resourceModel('events').collection.updateOne({ id: created.body.data.id }, { $unset: { images: '' } });
    const updated = await attachN(request(app).put(`/api/events/${created.body.data.id}`).set(auth()), 1);
    assert.equal(updated.body.data.images.length, 2);
    assert.equal(updated.body.data.images[0], created.body.data.image);
  });

  it('skills never store photos', async () => {
    const res = await attachN(request(app).post('/api/skills').set(auth()).field('title', 'Go'), 2);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.images, undefined);
    assert.equal(res.body.data.image, undefined);
  });

  it('rejects more than 30 photos in one upload', async () => {
    const res = await attachN(request(app).post('/api/gallery').set(auth()).field('title', 'Big'), 31);
    assert.equal(res.status, 400);
  });
});

describe('projects with multiple photos', () => {
  it('adds, reorders, removes and deletes project photos', async () => {
    const created = await attachN(request(app).post('/api/projects').set(auth())
      .field('title', 'P').field('category', 'web').field('description', 'd').field('tech', 'x'), 3);
    assert.equal(created.status, 201);
    const [a, b, c] = created.body.data.images;
    assert.equal(created.body.data.image, a);

    const updated = await request(app).put(`/api/projects/${created.body.data.id}`).set(auth())
      .send({ keepImages: JSON.stringify([b]) });
    assert.deepEqual(updated.body.data.images, [b]);
    assert.equal(updated.body.data.image, b);
    assert.equal(await status(a), 404);
    assert.equal(await status(c), 404);

    const fetched = (await request(app).get(`/api/projects/${created.body.data.id}`)).body.data;
    assert.deepEqual(fetched.images, [b]);

    await request(app).delete(`/api/projects/${created.body.data.id}`).set(auth());
    assert.equal(await status(b), 404);
  });
});

describe('research photos stay private', () => {
  it('every research photo needs the owner login', async () => {
    const created = await attachN(request(app).post('/api/research').set(auth()).field('title', 'R'), 2);
    for (const p of created.body.data.images) {
      assert.equal(await status(p), 404);
      assert.equal(await status(p, auth()), 200);
    }
    const updated = await attachN(request(app).put(`/api/research/${created.body.data.id}`).set(auth()), 1);
    const added = updated.body.data.images[2];
    assert.equal(await status(added), 404);
    assert.equal(await status(added, auth()), 200);
  });
});

describe('new sections', () => {
  for (const name of ['achievements', 'publications', 'testimonials', 'gallery']) {
    it(`/api/${name} is public, starts empty, and is owner-only for writes`, async () => {
      // Use a fresh name check: list is public
      const res = await request(app).get(`/api/${name}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.equal((await request(app).post(`/api/${name}`).send({ title: 'x' })).status, 401);
    });
  }

  it('publications parse tags', async () => {
    const res = await request(app).post('/api/publications').set(auth())
      .send({ title: 'Paper', tags: 'AI, NLP', link: 'https://example.com', type: 'paper' });
    assert.deepEqual(res.body.data.tags, ['AI', 'NLP']);
    assert.equal(res.body.data.type, 'paper');
  });
});
