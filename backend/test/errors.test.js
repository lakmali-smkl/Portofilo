// A database failure must return a 500 error, not leave the request hanging.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, login, request } = require('./helpers');

let app;
let token;
before(async () => {
  ({ app } = await setup());
  token = await login(app);
});
after(teardown);

const { resourceModel, Profile } = require('../models');

// Temporarily make a model method fail, run fn, then restore it.
async function withFailing(Model, method, fn) {
  const original = Model[method];
  const failing = () => { throw new Error('database unavailable'); };
  Model[method] = failing;
  try {
    await fn();
  } finally {
    Model[method] = original;
  }
}

describe('database errors on read routes', () => {
  const cases = [
    ['GET /api/projects', resourceModel('projects'), 'find', () => request(app).get('/api/projects')],
    ['GET /api/projects/:id', resourceModel('projects'), 'findOne', () => request(app).get('/api/projects/x')],
    ['GET /api/profile', Profile, 'findOne', () => request(app).get('/api/profile')],
    ['GET /api/skills', resourceModel('skills'), 'find', () => request(app).get('/api/skills')],
    ['GET /api/research', resourceModel('research'), 'find',
      () => request(app).get('/api/research').set('Authorization', `Bearer ${token}`)],
    ['GET /api/messages', resourceModel('messages'), 'find',
      () => request(app).get('/api/messages').set('Authorization', `Bearer ${token}`)],
    ['DELETE /api/messages/:id', resourceModel('messages'), 'findOneAndDelete',
      () => request(app).delete('/api/messages/x').set('Authorization', `Bearer ${token}`)]
  ];

  for (const [label, Model, method, send] of cases) {
    it(`${label} returns a 500 JSON error`, async () => {
      await withFailing(Model, method, async () => {
        const res = await send().timeout(5000);
        assert.equal(res.status, 500);
        assert.equal(res.body.success, false);
      });
    });
  }

  it('the API keeps working after an error', async () => {
    const res = await request(app).get('/api/projects');
    assert.equal(res.status, 200);
  });
});
