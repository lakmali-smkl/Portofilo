const dns = require('dns');
const mongoose = require('mongoose');


dns.setServers(['8.8.8.8', '1.1.1.1']);

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in backend/.env — see .env.example.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME || 'portfolio' });
}

module.exports = { connectDB, mongoose };
