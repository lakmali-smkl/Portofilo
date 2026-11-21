// Covers the optional email notification path with a fake transport, so
// no real email is ever sent.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.TEST_SMTP_USER = 'owner@example.com';
process.env.TEST_SMTP_PASS = 'app-password';
process.env.SMTP_TO = 'inbox@example.com';

const nodemailer = require('nodemailer');
const sent = [];
let failNext = false;
let transportOptions;
nodemailer.createTransport = (opts) => {
  transportOptions = opts;
  return {
    sendMail: async (mail) => {
      if (failNext) { failNext = false; throw new Error('SMTP down'); }
      sent.push(mail);
    }
  };
};

const { setup, teardown, request } = require('./helpers');

let app;
before(async () => { ({ app } = await setup()); });
after(teardown);

describe('contact email notifications', () => {
  it('emails the owner when SMTP is configured', async () => {
    const res = await request(app).post('/api/contact')
      .send({ name: 'Visitor', email: 'visitor@example.com', message: 'line1\nline2' });
    assert.equal(res.status, 201);
    assert.equal(res.body.emailSent, true);

    assert.equal(transportOptions.host, 'smtp.gmail.com');
    assert.equal(transportOptions.port, 587);
    assert.equal(transportOptions.secure, false);

    const mail = sent.at(-1);
    assert.equal(mail.to, 'inbox@example.com');
    assert.equal(mail.replyTo, 'visitor@example.com');
    assert.match(mail.subject, /Visitor/);
    assert.match(mail.html, /line1<br>line2/);
  });

  it('escapes HTML from the visitor so it cannot be injected into the email', async () => {
    const res = await request(app).post('/api/contact').send({
      name: '<img src=x onerror=alert(1)>',
      email: 'visitor@example.com',
      message: '<a href="https://phish.example">Click</a>\n& more'
    });
    assert.equal(res.status, 201);
    const { html } = sent.at(-1);
    assert.ok(!html.includes('<img'), html);
    assert.ok(!html.includes('<a href'), html);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;a href=&quot;https:\/\/phish\.example&quot;&gt;Click&lt;\/a&gt;<br>&amp; more/);
  });

  it('still saves the message when sending fails', async () => {
    failNext = true;
    const original = console.error;
    console.error = () => {};
    let res;
    try {
      res = await request(app).post('/api/contact')
        .send({ name: 'V', email: 'v@example.com', message: 'still saved' });
    } finally {
      console.error = original;
    }
    assert.equal(res.status, 201);
    assert.equal(res.body.emailSent, false);

    const { resourceModel } = require('../models');
    assert.ok(await resourceModel('messages').findOne({ message: 'still saved' }));
  });
});
