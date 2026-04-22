const passport = require('passport');
const { sendToken } = require('../utils/authUtils');

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
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({ status: 'success' });
};

module.exports = {
  googleCallback,
  getCurrentUser,
  logout
};