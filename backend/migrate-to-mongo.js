/**
 * One-time migration: copies everything currently in backend/data/*.json
 * and backend/uploads/ into MongoDB Atlas, so nothing you've already added
 * (profile, projects, skills, education, experience, certificates, events,
 * messages, your owner login) is lost when the server switches over to the
 * cloud database.
 *
 * Run once:   node migrate-to-mongo.js
 * Safe to re-run — it skips any collection that already has data in Mongo.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { connectDB, mongoose } = require('./db');
const { resourceModel, Image, Profile, Auth } = require('./models');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

function readJson(file, fallback) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${file}:`, e.message);
    return fallback;
  }
}

// Reads an old "/uploads/xyz.jpg" file from disk and stores it as a Mongo
// Image document, returning its new "/api/images/<id>" path. Leaves the
// value untouched if it isn't a local uploads path (e.g. already null).
async function migrateImagePath(oldPath) {
  if (!oldPath || !oldPath.startsWith('/uploads/')) return oldPath;
  const filename = oldPath.replace('/uploads/', '');
  const fullPath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    console.warn(`  ⚠️  Image file missing on disk, skipping: ${oldPath}`);
    return null;
  }
  const data = fs.readFileSync(fullPath);
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[ext] ||
    'application/octet-stream';
  const id = uuidv4();
  await Image.create({ id, data, contentType });
  console.log(`  🖼️  Migrated image ${oldPath} -> /api/images/${id}`);
  return `/api/images/${id}`;
}

async function migrateResourceCollection(name) {
  const Model = resourceModel(name);
  const existingCount = await Model.countDocuments();
  if (existingCount > 0) {
    console.log(`• ${name}: already has ${existingCount} document(s) in Mongo — skipping.`);
    return;
  }
  const items = readJson(`${name}.json`, []);
  if (!items.length) {
    console.log(`• ${name}: nothing to migrate (no local file or it's empty).`);
    return;
  }
  for (const item of items) {
    if (item.image) item.image = await migrateImagePath(item.image);
  }
  await Model.insertMany(items);
  console.log(`• ${name}: migrated ${items.length} item(s).`);
}

async function migrateProjects() {
  await migrateResourceCollection('projects');
}

async function migrateProfile() {
  const existing = await Profile.findOne({});
  if (existing) {
    console.log('• profile: already exists in Mongo — skipping.');
    return;
  }
  const profile = readJson('profile.json', null);
  if (!profile) {
    console.log('• profile: nothing to migrate.');
    return;
  }
  if (profile.photo) profile.photo = await migrateImagePath(profile.photo);
  delete profile._id;
  await Profile.create(profile);
  console.log('• profile: migrated.');
}

async function migrateAuth() {
  const existing = await Auth.findOne({});
  if (existing) {
    console.log('• auth (owner login): already exists in Mongo — skipping.');
    return;
  }
  const auth = readJson('auth.json', null);
  if (!auth) {
    console.log('• auth: nothing to migrate.');
    return;
  }
  delete auth._id;
  await Auth.create(auth);
  console.log('• auth (owner login): migrated — your existing password still works.');
}

async function migrateMessages() {
  await migrateResourceCollection('messages');
}

async function main() {
  console.log('Connecting to MongoDB Atlas...');
  await connectDB();
  console.log('Connected. Starting migration...\n');

  await migrateAuth();
  await migrateProfile();
  await migrateProjects();
  for (const name of ['skills', 'education', 'experience', 'certificates', 'events']) {
    await migrateResourceCollection(name);
  }
  await migrateMessages();

  console.log('\n✅ Migration complete. Your data now lives in MongoDB Atlas.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
