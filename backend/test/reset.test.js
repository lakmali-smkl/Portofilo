const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, silently, request, TEST_PASSWORD, PNG_1X1 } = require('./helpers');

let app;
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  ({ app } = await setup());
  token = await login(app);
});
after(teardown);

describe('POST /api/reset', () => {
  it('requires login', async () => {
    assert.equal((await request(app).post('/api/reset')).status, 401);
  });

  it('wipes custom content and images, restores defaults, and keeps login and messages', async () => {
    const project = (await request(app).post('/api/projects').set(auth())
      .field('title', 'Custom').field('category', 'c').field('description', 'd').field('tech', 'x')
      .attach('image', PNG_1X1, { filename: 'a.png', contentType: 'image/png' })).body.data;
    const photo = (await request(app).post('/api/profile').set(auth())
      .field('name', 'Changed')
      .attach('photo', PNG_1X1, { filename: 'me.png', contentType: 'image/png' })).body.data.photo;
    await request(app).post('/api/events').set(auth()).send({ title: 'My event' });
    await request(app).post('/api/research').set(auth()).send({ title: 'Secret research' });
    await silently(() => request(app).post('/api/contact').send({ name: 'V', email: 'v@example.com', message: 'hi' }));

    const res = await silently(() => request(app).post('/api/reset').set(auth()));
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const projects = (await request(app).get('/api/projects')).body.data;
    assert.equal(projects.length, 3);
    assert.ok(!projects.some(p => p.id === project.id));
    assert.equal((await request(app).get('/api/profile')).body.data.name, 'Kasunika');
    assert.equal((await request(app).get('/api/events')).body.data.length, 0);
    assert.equal((await request(app).get('/api/research').set(auth())).body.data.length, 0);
    assert.equal((await request(app).get('/api/skills')).body.data.length, 18);

    // Uploaded images are deleted
    assert.equal((await request(app).get(project.image)).status, 404);
    assert.equal((await request(app).get(photo)).status, 404);

    // Owner password and the contact inbox survive a reset
    assert.equal((await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD })).status, 200);
    assert.equal((await request(app).get('/api/messages').set(auth())).body.data.length, 1);
  });
});
