// The backend serves the website itself (one service to deploy) without
// ever exposing backend files such as .env, and honours ALLOWED_ORIGINS.
process.env.ALLOWED_ORIGINS = 'https://kasunika.example.com/, https://www.kasunika.example.com';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request } = require('./helpers');

let app;
before(async () => { ({ app } = await setup()); });
after(teardown);

describe('serves the website', () => {
  it('GET / returns the page, marked as served by the backend', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.text, /<meta name="portfolio-api" content="same-origin" \/>/);
    assert.match(res.text, /id="projects-grid"/);
  });

  it('serves /index.html too', async () => {
    const res = await request(app).get('/index.html');
    assert.equal(res.status, 200);
    assert.match(res.text, /portfolio-api/);
  });

  it('serves script.js and style.css with the right types', async () => {
    const js = await request(app).get('/script.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /javascript/);
    const css = await request(app).get('/style.css');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /text\/css/);
  });

  it('serves the images folder', async () => {
    const res = await request(app).get('/images/profile.jpg');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /image\/jpeg/);
  });

  it('does not announce the server software (no X-Powered-By header)', async () => {
    for (const url of ['/', '/api/health', '/api/nope']) {
      const res = await request(app).get(url);
      assert.equal(res.headers['x-powered-by'], undefined, url);
    }
  });

  it('the CV check (HEAD assets/Kasunika_CV.pdf) is 404 without the file and 200 with it', async () => {
    const fs = require('fs');
    const path = require('path');
    const cv = path.join(__dirname, '..', '..', 'assets', 'Kasunika_CV.pdf');
    const existed = fs.existsSync(cv);
    if (!existed) {
      assert.equal((await request(app).head('/assets/Kasunika_CV.pdf')).status, 404);
      assert.equal((await request(app).get('/api/site-info')).body.cv, false);
      fs.writeFileSync(cv, '%PDF-1.4 test');
    }
    try {
      const res = await request(app).head('/assets/Kasunika_CV.pdf');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /pdf/);
      const info = await request(app).get('/api/site-info');
      assert.equal(info.status, 200);
      assert.equal(info.body.cv, true);
    } finally {
      if (!existed) fs.unlinkSync(cv);
    }
  });

  it('API routes still work alongside the site', async () => {
    assert.equal((await request(app).get('/api/health')).status, 200);
  });
});

describe('never exposes backend files', () => {
  const secret = [
    '/backend/.env', '/.env', '/backend/server.js', '/server.js', '/backend/package.json',
    '/package.json', '/db.js', '/models.js', '/backend/test/helpers.js', '/.git/config',
    '/images/../backend/.env', '/images/%2e%2e/backend/.env', '/assets/../backend/server.js',
    '/images/..%2f..%2fbackend%2f.env', '/README.md'
  ];
  for (const url of secret) {
    it(`404 for ${url}`, async () => {
      const res = await request(app).get(url);
      assert.equal(res.status, 404, `${url} returned ${res.status}`);
      assert.doesNotMatch(res.text || '', /MONGODB_URI|require\(|SMTP_PASS/);
    });
  }
});

describe('CORS', () => {
  it('allows domains listed in ALLOWED_ORIGINS (trailing slash ignored)', async () => {
    for (const origin of ['https://kasunika.example.com', 'https://www.kasunika.example.com']) {
      const res = await request(app).get('/api/health').set('Origin', origin);
      assert.equal(res.headers['access-control-allow-origin'], origin);
    }
  });

  it('still allows local development origins (incl. VS Code Live Server)', async () => {
    for (const origin of ['http://localhost:8000', 'http://127.0.0.1:5500']) {
      const res = await request(app).get('/api/health').set('Origin', origin);
      assert.equal(res.headers['access-control-allow-origin'], origin);
    }
  });

  it('rejects other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});
