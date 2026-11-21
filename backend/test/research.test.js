const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, silently, request, PNG_1X1 } = require('./helpers');

let app;
let token;
let researchId;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  ({ app } = await setup());
  token = await login(app);
});
after(teardown);

beforeEach(async () => {
  const res = await request(app).post('/api/research').set(auth()).send({ title: 'Thesis', tags: 'ML, NLP' });
  researchId = res.body.data.id;
});

describe('research diary logs', () => {
  it('requires login', async () => {
    assert.equal((await request(app).post(`/api/research/${researchId}/logs`).send({ note: 'x' })).status, 401);
    assert.equal((await request(app).delete(`/api/research/${researchId}/logs/x`)).status, 401);
  });

  it('requires a note', async () => {
    const res = await request(app).post(`/api/research/${researchId}/logs`).set(auth()).send({ note: '  ' });
    assert.equal(res.status, 400);
  });

  it('adds an entry (defaulting the date to today) and removes it', async () => {
    const res = await request(app).post(`/api/research/${researchId}/logs`).set(auth()).send({ note: ' Read 3 papers ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.logs.length, 1);
    const log = res.body.data.logs[0];
    assert.equal(log.note, 'Read 3 papers');
    assert.match(log.date, /^\d{4}-\d{2}-\d{2}$/);

    const withDate = await request(app).post(`/api/research/${researchId}/logs`).set(auth())
      .send({ note: 'second', date: '2026-01-15' });
    assert.equal(withDate.body.data.logs.length, 2);
    assert.equal(withDate.body.data.logs[1].date, '2026-01-15');

    const del = await request(app).delete(`/api/research/${researchId}/logs/${log.id}`).set(auth());
    assert.equal(del.status, 200);
    assert.deepEqual(del.body.data.logs.map(l => l.note), ['second']);
  });

  it('returns 404 for an unknown research project', async () => {
    assert.equal((await request(app).post('/api/research/nope/logs').set(auth()).send({ note: 'x' })).status, 404);
    assert.equal((await request(app).delete('/api/research/nope/logs/x').set(auth())).status, 404);
  });

  it('keeps logs when the research project itself is edited', async () => {
    await request(app).post(`/api/research/${researchId}/logs`).set(auth()).send({ note: 'keep me' });
    const upd = await request(app).put(`/api/research/${researchId}`).set(auth()).send({ title: 'Renamed' });
    assert.equal(upd.body.data.title, 'Renamed');
    assert.equal(upd.body.data.logs.length, 1);
  });
});

const SUB_TABLES = { papers: 'title', milestones: 'task', resources: 'title', tasks: 'title' };

for (const [table, required] of Object.entries(SUB_TABLES)) {
  describe(`research ${table}`, () => {
    const base = () => `/api/research/${researchId}/${table}`;

    it('requires login', async () => {
      assert.equal((await request(app).post(base()).send({ [required]: 'x' })).status, 401);
      assert.equal((await request(app).put(`${base()}/x`).send({})).status, 401);
      assert.equal((await request(app).delete(`${base()}/x`)).status, 401);
    });

    it(`requires ${required}`, async () => {
      const res = await request(app).post(base()).set(auth()).send({ note: 'no required field' });
      assert.equal(res.status, 400);
      assert.match(res.body.message, new RegExp(`${required} is required`));
    });

    it('adds, edits and removes entries', async () => {
      const added = await request(app).post(base()).set(auth()).send({ [required]: 'First', extra: 'a' });
      assert.equal(added.status, 201);
      assert.equal(added.body.data[table].length, 1);
      const entry = added.body.data[table][0];
      assert.ok(entry.id && entry.createdAt);
      assert.equal(entry.extra, 'a');

      await request(app).post(base()).set(auth()).send({ [required]: 'Second' });

      const edited = await request(app).put(`${base()}/${entry.id}`).set(auth()).send({ extra: 'b' });
      assert.equal(edited.status, 200);
      const editedEntry = edited.body.data[table].find(e => e.id === entry.id);
      assert.equal(editedEntry.extra, 'b');
      assert.equal(editedEntry[required], 'First');
      assert.ok(editedEntry.updatedAt);
      assert.equal(edited.body.data[table].length, 2);

      const removed = await request(app).delete(`${base()}/${entry.id}`).set(auth());
      assert.equal(removed.status, 200);
      assert.deepEqual(removed.body.data[table].map(e => e[required]), ['Second']);
    });

    it('returns 404 for an unknown project or entry', async () => {
      assert.equal((await request(app).post(`/api/research/nope/${table}`).set(auth()).send({ [required]: 'x' })).status, 404);
      assert.equal((await request(app).put(`/api/research/nope/${table}/x`).set(auth()).send({})).status, 404);
      assert.equal((await request(app).put(`${base()}/no-such-entry`).set(auth()).send({})).status, 404);
      assert.equal((await request(app).delete(`/api/research/nope/${table}/x`).set(auth())).status, 404);
    });
  });
}

describe('sub-table ids are server-controlled', () => {
  it('ignores a client-supplied id and createdAt when adding', async () => {
    const res = await request(app).post(`/api/research/${researchId}/papers`).set(auth())
      .send({ title: 'P', id: 'chosen-id', createdAt: '1999-01-01' });
    const entry = res.body.data.papers[0];
    assert.notEqual(entry.id, 'chosen-id');
    assert.notEqual(entry.createdAt, '1999-01-01');
  });

  it('does not let an edit change the id or createdAt', async () => {
    const added = await request(app).post(`/api/research/${researchId}/papers`).set(auth()).send({ title: 'P' });
    const entry = added.body.data.papers[0];
    const res = await request(app).put(`/api/research/${researchId}/papers/${entry.id}`).set(auth())
      .send({ title: 'Q', id: 'hijacked', createdAt: '1999-01-01' });
    const edited = res.body.data.papers[0];
    assert.equal(edited.id, entry.id);
    assert.equal(edited.createdAt, entry.createdAt);
    assert.equal(edited.title, 'Q');

    // Still editable and deletable by its real id
    assert.equal((await request(app).put(`/api/research/${researchId}/papers/${entry.id}`).set(auth()).send({ title: 'R' })).status, 200);
    assert.equal((await request(app).put(`/api/research/${researchId}/papers/hijacked`).set(auth()).send({})).status, 404);
  });
});

describe('research images are private', () => {
  const upload = (req) => req.attach('image', PNG_1X1, { filename: 'r.png', contentType: 'image/png' });

  it('serves a research image only to the logged-in owner', async () => {
    const created = await upload(request(app).post('/api/research').set(auth()).field('title', 'Secret'));
    assert.equal(created.status, 201);
    const image = created.body.data.image;

    assert.equal((await request(app).get(image)).status, 404);
    assert.equal((await request(app).get(image).set('Authorization', 'Bearer bad.token')).status, 404);

    const owner = await request(app).get(image).set(auth());
    assert.equal(owner.status, 200);
    assert.deepEqual(Buffer.from(owner.body), PNG_1X1);
    assert.equal(owner.headers['cache-control'], 'private, no-store');
  });

  it('keeps a replaced research image private', async () => {
    const created = await upload(request(app).post('/api/research').set(auth()).field('title', 'Secret'));
    const updated = await upload(request(app).put(`/api/research/${created.body.data.id}`).set(auth()));
    assert.equal((await request(app).get(updated.body.data.image)).status, 404);
    assert.equal((await request(app).get(updated.body.data.image).set(auth())).status, 200);
  });

  it('keeps images of public sections public', async () => {
    const created = await upload(request(app).post('/api/events').set(auth()).field('title', 'Public'));
    assert.equal((await request(app).get(created.body.data.image)).status, 200);
  });

  it('marks research images uploaded before this fix as private on startup', async () => {
    const { Image, resourceModel } = require('../models');
    const server = require('../server');
    await Image.collection.insertOne({ id: 'legacy-img', data: PNG_1X1, contentType: 'image/png' });
    await resourceModel('research').create({ id: 'legacy-research', title: 'Old', image: '/api/images/legacy-img' });
    assert.equal((await request(app).get('/api/images/legacy-img')).status, 200);

    await silently(() => server.initApp());

    assert.equal((await request(app).get('/api/images/legacy-img')).status, 404);
    assert.equal((await request(app).get('/api/images/legacy-img').set(auth())).status, 200);
  });
});
