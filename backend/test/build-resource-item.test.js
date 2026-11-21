// Unit tests for the pure field-normalisation helper (no database needed).
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildResourceItem, RESOURCES } = require('../server');

describe('buildResourceItem', () => {
  const def = { hasImage: true, arrayFields: ['tags'], numberFields: ['level'] };

  it('trims strings and merges onto the existing item', () => {
    const out = buildResourceItem(def, { title: '  Hi  ' }, null, { id: '1', description: 'old' });
    assert.deepEqual(out, { id: '1', title: 'Hi', description: 'old' });
  });

  it('never lets the body overwrite id, and strips _id', () => {
    const out = buildResourceItem(def, { id: 'evil', title: 't' }, null, { id: 'real', _id: 'mongo' });
    assert.equal(out.id, 'real');
    assert.equal('_id' in out, false);
  });

  it('parses array fields from JSON or comma lists', () => {
    assert.deepEqual(buildResourceItem(def, { tags: '["a","b"]' }).tags, ['a', 'b']);
    assert.deepEqual(buildResourceItem(def, { tags: ' a, b ,, c' }).tags, ['a', 'b', 'c']);
    assert.deepEqual(buildResourceItem(def, { tags: '' }).tags, []);
  });

  it('clamps number fields to 0-100', () => {
    assert.equal(buildResourceItem(def, { level: '55' }).level, 55);
    assert.equal(buildResourceItem(def, { level: '999' }).level, 100);
    assert.equal(buildResourceItem(def, { level: '-1' }).level, 0);
    assert.equal(buildResourceItem(def, { level: 'x' }).level, 0);
    assert.equal(buildResourceItem(def, { level: 42 }).level, 42);
  });

  it('removes a number field when sent blank', () => {
    assert.equal('level' in buildResourceItem(def, { level: '' }, null, { level: 70 }), false);
  });

  it('sets images (and image = the cover) only for image resources and only when given', () => {
    const out = buildResourceItem(def, {}, ['/api/images/1', '/api/images/2']);
    assert.deepEqual(out.images, ['/api/images/1', '/api/images/2']);
    assert.equal(out.image, '/api/images/1');

    const cleared = buildResourceItem(def, {}, [], { image: '/old', images: ['/old'] });
    assert.deepEqual(cleared.images, []);
    assert.equal(cleared.image, null);

    // null = leave photos untouched
    assert.equal(buildResourceItem(def, {}, null, { image: '/old' }).image, '/old');
    assert.equal(buildResourceItem({ ...def, hasImage: false }, {}, ['/api/images/1']).image, undefined);
  });

  it('never copies photo fields from the request body as text', () => {
    const out = buildResourceItem(def, { title: 't', image: '/evil', images: '["/evil"]', keepImages: '[]' }, null, {});
    assert.deepEqual(out, { title: 't' });
  });
});

describe('RESOURCES config', () => {
  it('only research is private', () => {
    const priv = Object.entries(RESOURCES).filter(([, d]) => d.private).map(([n]) => n);
    assert.deepEqual(priv, ['research']);
  });

  it('every seed item has a title', () => {
    for (const [name, def] of Object.entries(RESOURCES)) {
      for (const item of def.seed()) assert.ok(item.title, `${name} seed item missing title`);
    }
  });

  it('seed skill levels are within 0-100', () => {
    for (const s of RESOURCES.skills.seed()) {
      if (s.level !== undefined) assert.ok(s.level >= 0 && s.level <= 100);
    }
  });
});
