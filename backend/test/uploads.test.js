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

const newProject = () => request(app).post('/api/projects').set(auth())
  .field('title', 'T').field('category', 'c').field('description', 'd').field('tech', 'x');

describe('image upload validation', () => {
  it('accepts jpg, png, gif, webp and svg', async () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'], ['a.jpeg', 'image/jpeg'], ['a.png', 'image/png'],
      ['a.gif', 'image/gif'], ['a.webp', 'image/webp'], ['a.svg', 'image/svg+xml']
    ]) {
      const res = await newProject().attach('image', PNG_1X1, { filename: name, contentType: type });
      assert.equal(res.status, 201, `${name} should be accepted`);
    }
  });

  it('rejects non-image files with 400', async () => {
    const res = await newProject()
      .attach('image', Buffer.from('%PDF-1.4'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Only image files/);
  });

  it('rejects an image extension with a non-image MIME type', async () => {
    const res = await newProject()
      .attach('image', Buffer.from('x'), { filename: 'evil.png', contentType: 'text/html' });
    assert.equal(res.status, 400);
  });

  it('rejects an image MIME type with a non-image extension', async () => {
    const res = await newProject()
      .attach('image', PNG_1X1, { filename: 'evil.html', contentType: 'image/png' });
    assert.equal(res.status, 400);
  });

  it('rejects files over 5MB', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await newProject().attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /File too large/);
  });
});

describe('GET /api/images/:id', () => {
  it('returns 404 for an unknown image', async () => {
    const res = await request(app).get('/api/images/does-not-exist');
    assert.equal(res.status, 404);
  });

  it('serves images with long-lived cache headers', async () => {
    const created = await newProject().attach('image', PNG_1X1, { filename: 'a.png', contentType: 'image/png' });
    const res = await request(app).get(created.body.data.image);
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /max-age=31536000/);
    assert.match(res.headers['cache-control'], /immutable/);
  });
});
