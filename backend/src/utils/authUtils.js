const jwt = require('jsonwebtoken');

const createToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const sendToken = (user, statusCode, req, res) => {
  const token = createToken(user._id);
  const cookieDays = Number(process.env.JWT_COOKIE_EXPIRES_IN);
  const cookieMaxAge = (Number.isFinite(cookieDays) ? cookieDays : 7) * 24 * 60 * 60 * 1000;

  const cookieOptions = {
    maxAge: cookieMaxAge,
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove accessToken and refreshToken from output
  user.accessToken = undefined;
  user.refreshToken = undefined;

  const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendURL}/auth/callback?token=${token}`);
};

module.exports = { createToken, sendToken };
