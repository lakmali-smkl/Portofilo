/**
 * Shared test setup: spins up a throwaway in-memory MongoDB, points the
 * app at it, and creates an owner account with a known password — so the
 * suite never touches the real MongoDB Atlas database or sends real email.
 */

// dotenv never overrides variables that already exist, so blanking these
// before server.js loads keeps a real backend/.env from enabling email.
process.env.SMTP_USER = process.env.TEST_SMTP_USER || '';
process.env.SMTP_PASS = process.env.TEST_SMTP_PASS || '';
process.env.MONGODB_URI = 'mongodb://unused-in-tests';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { mongoose } = require('../db');

const TEST_PASSWORD = 'test-password-123';
const TEST_JWT_SECRET = 'test-jwt-secret';

let mongod;
let server;

async function setup() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'portfolio-test' });

  // Pre-create the owner so bootstrapAuth() reuses it instead of
  // generating (and printing) a random password.
  const { Auth } = require('../models');
  await Auth.create({
    passwordHash: bcrypt.hashSync(TEST_PASSWORD, 4),
    jwtSecret: TEST_JWT_SECRET
  });

  server = require('../server');
  await silently(() => server.initApp());
  return server;
}

async function teardown() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function login(app) {
  const res = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`Test login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

// Seeding logs "✅ Default ... seeded" lines; keep test output clean.
async function silently(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}

// A tiny valid 1x1 PNG for upload tests.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = { setup, teardown, login, silently, request, mongoose, TEST_PASSWORD, TEST_JWT_SECRET, PNG_1X1 };
