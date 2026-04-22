const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  displayName: String,
  accessToken: String,
  refreshToken: String,
  lastSync: Date
});

module.exports = mongoose.model('User', UserSchema);