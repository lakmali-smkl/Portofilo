const { mongoose } = require('./db');
const { Schema } = mongoose;

// Flat, flexible document shape: every resource collection (projects,
// skills, education, experience, certificates, events, messages) stores
// items with a uuid `id` field (not Mongo's ObjectId) so the frontend's
// existing code — which looks items up by `.id` — needs no changes.
const genericSchema = new Schema(
  { id: { type: String, required: true, unique: true } },
  { strict: false, versionKey: false }
);

function resourceModel(collectionName) {
  return mongoose.models[collectionName] || mongoose.model(collectionName, genericSchema, collectionName);
}

// Uploaded photos live here as binary data (Mongo documents, not disk
// files) so "Manage Projects" photos survive on a different machine/host
// too. Served back out via GET /api/images/:id.
const ImageSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    data: Buffer,
    contentType: String,
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);
const Image = mongoose.models.Image || mongoose.model('Image', ImageSchema, 'images');

// Singletons (one document each, no `id` needed) — profile info and the
// owner auth secrets.
const SingletonSchema = new Schema({}, { strict: false, versionKey: false });
const Profile = mongoose.models.Profile || mongoose.model('Profile', SingletonSchema, 'profile');
const Auth = mongoose.models.Auth || mongoose.model('Auth', SingletonSchema, 'auth');

module.exports = { resourceModel, Image, Profile, Auth };
