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
  it('seeds 3 default projects on first run', async () => {
    const res = await request(app).get('/api/projects');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 3);
    for (const p of res.body.data) {
      assert.ok(p.id);
      assert.ok(Array.isArray(p.tech));
    }
  });
});

describe('projects CRUD', () => {
  it('requires login to create, update, or delete', async () => {
    assert.equal((await request(app).post('/api/projects').send({ title: 'x' })).status, 401);
    assert.equal((await request(app).put('/api/projects/abc').send({ title: 'x' })).status, 401);
    assert.equal((await request(app).delete('/api/projects/abc')).status, 401);
  });

  it('validates required fields', async () => {
    const res = await request(app).post('/api/projects').set(auth())
      .send({ title: 'Only a title' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /required/);
  });

  it('creates a project from JSON, with comma-separated tech and default links', async () => {
    const res = await request(app).post('/api/projects').set(auth()).send({
      title: '  My App  ',
      category: 'web',
      description: ' A thing ',
      tech: 'Node, Express , ,MongoDB'
    });
    assert.equal(res.status, 201);
    const p = res.body.data;
    assert.equal(p.title, 'My App');
    assert.equal(p.description, 'A thing');
    assert.deepEqual(p.tech, ['Node', 'Express', 'MongoDB']);
    assert.equal(p.github, 'https://github.com/[Your-GitHub]');
    assert.equal(p.demo, '#contact');
    assert.equal(p.image, null);

    const fetched = await request(app).get(`/api/projects/${p.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.title, 'My App');
  });

  it('accepts tech as a JSON array string', async () => {
    const res = await request(app).post('/api/projects').set(auth()).send({
      title: 'T', category: 'c', description: 'd', tech: '["A, with comma","B"]'
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.tech, ['A, with comma', 'B']);
  });

  it('creates a project via multipart upload with an image', async () => {
    const res = await request(app).post('/api/projects').set(auth())
      .field('title', 'With Image')
      .field('category', 'web')
      .field('description', 'desc')
      .field('tech', 'HTML')
      .attach('image', PNG_1X1, { filename: 'shot.png', contentType: 'image/png' });
    assert.equal(res.status, 201);
    assert.match(res.body.data.image, /^\/api\/images\/[0-9a-f-]{36}$/);

    const img = await request(app).get(res.body.data.image);
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    assert.deepEqual(Buffer.from(img.body), PNG_1X1);
  });

  it('lists newest first', async () => {
    const res = await request(app).get('/api/projects');
    const dates = res.body.data.map(p => p.createdAt);
    assert.deepEqual(dates, [...dates].sort().reverse());
  });

  it('returns 404 for an unknown project', async () => {
    const res = await request(app).get('/api/projects/no-such-id');
    assert.equal(res.status, 404);
  });

  it('updates only the fields provided', async () => {
    const created = (await request(app).post('/api/projects').set(auth()).send({
      title: 'Before', category: 'web', description: 'keep me', tech: 'A,B', github: 'https://gh/x'
    })).body.data;

    const res = await request(app).put(`/api/projects/${created.id}`).set(auth()).send({ title: 'After' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.title, 'After');
    assert.equal(res.body.data.description, 'keep me');
    assert.deepEqual(res.body.data.tech, ['A', 'B']);
    assert.equal(res.body.data.github, 'https://gh/x');
    assert.ok(res.body.data.updatedAt);

    const fetched = (await request(app).get(`/api/projects/${created.id}`)).body.data;
    assert.equal(fetched.title, 'After');
    assert.equal(fetched.description, 'keep me');
  });

  it('replaces the image on update (keepImages=[] + new photo) and deletes the old one', async () => {
    const created = (await request(app).post('/api/projects').set(auth())
      .field('title', 'Img').field('category', 'c').field('description', 'd').field('tech', 'x')
      .attach('image', PNG_1X1, { filename: 'a.png', contentType: 'image/png' })).body.data;

    const res = await request(app).put(`/api/projects/${created.id}`).set(auth())
      .field('keepImages', '[]')
      .attach('images', PNG_1X1, { filename: 'b.png', contentType: 'image/png' });
    assert.deepEqual(res.body.data.images, [res.body.data.image]);
    assert.equal(res.status, 200);
    assert.notEqual(res.body.data.image, created.image);

    assert.equal((await request(app).get(created.image)).status, 404);
    assert.equal((await request(app).get(res.body.data.image)).status, 200);
  });

  it('returns 404 when updating an unknown project', async () => {
    const res = await request(app).put('/api/projects/nope').set(auth()).send({ title: 'x' });
    assert.equal(res.status, 404);
  });

  it('deletes a project and its image', async () => {
    const created = (await request(app).post('/api/projects').set(auth())
      .field('title', 'Doomed').field('category', 'c').field('description', 'd').field('tech', 'x')
      .attach('image', PNG_1X1, { filename: 'a.png', contentType: 'image/png' })).body.data;

    const res = await request(app).delete(`/api/projects/${created.id}`).set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, created.id);

    assert.equal((await request(app).get(`/api/projects/${created.id}`)).status, 404);
    assert.equal((await request(app).get(created.image)).status, 404);
    assert.equal((await request(app).delete(`/api/projects/${created.id}`).set(auth())).status, 404);
  });
});
