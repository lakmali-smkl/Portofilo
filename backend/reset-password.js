/**
 * Forgot your owner password? Run this instead of asking an AI to do it
 * for you — it updates the password directly in MongoDB Atlas.
 *
 *   node reset-password.js YourNewPassword123
 *
 * Restart the backend afterwards if it's currently running (it loads the
 * password once at startup), then log in on the site with the new one.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, mongoose } = require('./db');
const { Auth } = require('./models');

async function main() {
  const newPassword = process.argv[2];
  if (!newPassword || newPassword.length < 6) {
    console.error('Usage: node reset-password.js <newPassword>   (minimum 6 characters)');
    process.exit(1);
  }

  await connectDB();
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const result = await Auth.updateOne({}, { passwordHash });

  if (result.matchedCount === 0) {
    console.error('No owner account found yet — run "node server.js" once first to create one, then try again.');
  } else {
    console.log('✅ Password updated. Restart the backend if it is currently running, then log in with your new password.');
  }

  await mongoose.disconnect();
  process.exit(result.matchedCount === 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Could not reset password:', err.message);
  process.exit(1);
});
