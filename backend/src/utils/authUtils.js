const jwt = require('jsonwebtoken');

const createToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const resolveCookieSecurity = (req) => {
  return Boolean(
    req.secure
    || req.headers['x-forwarded-proto'] === 'https'
    || String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true'
  );
};

const buildAuthCookieOptions = (req, maxAge) => {
  const secure = resolveCookieSecurity(req);
  const sameSiteEnv = String(process.env.COOKIE_SAMESITE || '').toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(sameSiteEnv)
    ? sameSiteEnv
    : (secure ? 'none' : 'lax');

  return {
    maxAge,
    httpOnly: true,
    secure,
    sameSite
  };
};

const sendToken = (user, statusCode, req, res) => {
  const token = createToken(user._id);
  const cookieDays = Number(process.env.JWT_COOKIE_EXPIRES_IN);
  const cookieMaxAge = (Number.isFinite(cookieDays) ? cookieDays : 7) * 24 * 60 * 60 * 1000;

  const cookieOptions = buildAuthCookieOptions(req, cookieMaxAge);

  res.cookie('jwt', token, cookieOptions);

  // Remove accessToken and refreshToken from output
  user.accessToken = undefined;
  user.refreshToken = undefined;

  const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendURL}/auth/callback`);
};

const clearAuthCookie = (req, res) => {
  const cookieOptions = buildAuthCookieOptions(req, 0);
  res.clearCookie('jwt', cookieOptions);
};

module.exports = { createToken, sendToken, clearAuthCookie };
