const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
          existingUser.accessToken = accessToken;
          if (refreshToken) {
            existingUser.refreshToken = refreshToken;
          }
          await existingUser.save();
          return done(null, existingUser);
        }

        const newUser = await new User({
          googleId: profile.id,
          displayName: profile.displayName,
          email: profile.emails[0].value,
          accessToken,
          refreshToken,
        }).save();
        done(null, newUser);
      } catch (err) {
        done(err, null);
      }
    }
  )
);