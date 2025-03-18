const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const { masterPool } = require("./database");
const userService = require("../services/userService");

// Configure Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const tenantId = req.query.tenantId || req.query.state;

        if (!tenantId) {
          return done(new Error("No tenant ID provided"), null);
        }

        const [tenants] = await masterPool.query(
          "SELECT * FROM tenants WHERE id = ?",
          [tenantId]
        );

        if (tenants.length === 0) {
          return done(new Error("Invalid tenant ID"), null);
        }

        const userData = {
          email: profile.emails[0].value,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          authProvider: "google",
          authProviderId: profile.id,
        };

        const user = await userService.findOrCreateOAuthUser(
          tenantId,
          userData
        );

        return done(null, {
          ...user,
          tenantId,
        });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Configure Microsoft OAuth Strategy
passport.use(
  new MicrosoftStrategy(
    {
      clientID: process.env.OUTLOOK_CLIENT_ID,
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
      callbackURL: process.env.OUTLOOK_CALLBACK_URL,
      scope: ["user.read"],
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const tenantId = req.query.tenantId || req.query.state;

        if (!tenantId) {
          return done(new Error("No tenant ID provided"), null);
        }

        const [tenants] = await masterPool.query(
          "SELECT * FROM tenants WHERE id = ?",
          [tenantId]
        );

        if (tenants.length === 0) {
          return done(new Error("Invalid tenant ID"), null);
        }

        const userData = {
          email: profile.emails[0].value,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          authProvider: "outlook",
          authProviderId: profile.id,
        };

        const user = await userService.findOrCreateOAuthUser(
          tenantId,
          userData
        );

        return done(null, {
          ...user,
          tenantId,
        });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
