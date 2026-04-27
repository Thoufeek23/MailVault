const passport = require('passport');
const { sendToken, clearAuthCookie } = require('../utils/authUtils');

const googleCallback = (req, res) => {
  sendToken(req.user, 200, req, res);
};

const getCurrentUser = (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
};

const logout = (req, res) => {
  clearAuthCookie(req, res);
  res.status(200).json({ status: 'success' });
};

module.exports = {
  googleCallback,
  getCurrentUser,
  logout
};