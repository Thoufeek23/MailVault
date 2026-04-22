const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Initial Google Login
router.get(
  '/google',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.insert'
    ],
    accessType: 'offline',
    prompt: 'consent',
    session: false
  })
);

// Google Callback
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false }),
  authController.googleCallback
);

// Get User
router.get('/current_user', protect, authController.getCurrentUser);

// Logout
router.get('/logout', authController.logout);

module.exports = router;