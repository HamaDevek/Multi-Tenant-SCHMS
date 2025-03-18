const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Kafka } = require("kafkajs");
const mysql = require("mysql2/promise");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const uuid = require("uuid");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Database connection
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_MASTER,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const masterPool = mysql.createPool(dbConfig);

// Kafka producer
const kafka = new Kafka({
  clientId: "auth-service",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

const producer = kafka.producer();

// Connect to Kafka
const connectKafka = async () => {
  try {
    await producer.connect();
    console.log("Connected to Kafka");
  } catch (error) {
    console.error("Failed to connect to Kafka:", error);
  }
};

connectKafka();

// Publish audit log to Kafka
const publishAuditLog = async (auditData) => {
  try {
    await producer.send({
      topic: "audit-logs",
      messages: [{ value: JSON.stringify(auditData) }],
    });
  } catch (error) {
    console.error("Failed to publish audit log:", error);
    // Fallback: Log to console
    console.log("Audit log (Kafka unavailable):", auditData);
  }
};

// Configure Passport
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

        // Check if tenant exists
        const [tenants] = await masterPool.query(
          "SELECT * FROM tenants WHERE id = ?",
          [tenantId]
        );

        if (tenants.length === 0) {
          return done(new Error("Invalid tenant ID"), null);
        }

        // Get tenant database connection
        const tenantDb = await getTenantConnection(tenantId);

        // Find or create user
        const [existingUsers] = await tenantDb.query(
          'SELECT * FROM users WHERE email = ? OR (authProvider = "google" AND authProviderId = ?)',
          [profile.emails[0].value, profile.id]
        );

        let user;
        if (existingUsers.length > 0) {
          user = existingUsers[0];
          // Update auth provider info if needed
          if (
            user.authProvider !== "google" ||
            user.authProviderId !== profile.id
          ) {
            await tenantDb.query(
              "UPDATE users SET authProvider = ?, authProviderId = ? WHERE id = ?",
              ["google", profile.id, user.id]
            );
          }
        } else {
          // Create new user
          const userId = uuid.v4();
          await tenantDb.query(
            "INSERT INTO users (id, email, firstName, lastName, role, authProvider, authProviderId) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
              userId,
              profile.emails[0].value,
              profile.name.givenName,
              profile.name.familyName,
              "student",
              "google",
              profile.id,
            ]
          );

          // Create student profile
          await tenantDb.query(
            "INSERT INTO student_profiles (id, userId) VALUES (?, ?)",
            [uuid.v4(), userId]
          );

          user = {
            id: userId,
            email: profile.emails[0].value,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            role: "student",
          };
        }

        await publishAuditLog({
          userId: user.id,
          tenantId,
          action: "google_oauth_login",
          status: "success",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });

        return done(null, {
          ...user,
          tenantId,
        });
      } catch (error) {
        console.error("Google OAuth error:", error);
        await publishAuditLog({
          userId: null,
          tenantId: req.query.tenantId || req.query.state,
          action: "google_oauth_login",
          status: "failure",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          details: error.message,
        });
        return done(error, null);
      }
    }
  )
);

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
      // Similar implementation as Google OAuth
      // ...
    }
  )
);

// Get tenant connection
const getTenantConnection = async (tenantId) => {
  if (!tenantId) {
    throw new Error("Tenant ID is required");
  }

  const [rows] = await masterPool.query("SELECT * FROM tenants WHERE id = ?", [
    tenantId,
  ]);

  if (rows.length === 0) {
    throw new Error(`Tenant with id ${tenantId} not found`);
  }

  // Sanitize tenant ID for database name
  const sanitizedId = tenantId.replace(/-/g, "_");
  const dbName = `school_${sanitizedId}`;

  // Create a connection to the tenant database
  const tenantDb = mysql.createPool({
    ...dbConfig,
    database: dbName,
    connectionLimit: 5,
  });

  return tenantDb;
};

// Generate tokens
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m" }
  );

  const refreshToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d" }
  );

  return { accessToken, refreshToken };
};

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "auth-service",
    timestamp: new Date().toISOString(),
  });
});

// Login endpoint
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const tenantId = req.headers["x-tenant-id"];

    if (!email || !password || !tenantId) {
      return res.status(400).json({
        status: "error",
        message: "Email, password, and tenant ID are required",
      });
    }

    // Get tenant database connection
    const tenantDb = await getTenantConnection(tenantId);

    // Find user
    const [users] = await tenantDb.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      await publishAuditLog({
        userId: null,
        tenantId,
        action: "user_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: "User not found",
      });

      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    const user = users[0];

    // Check if user is using OAuth
    if (user.authProvider !== "local" && user.authProvider !== null) {
      await publishAuditLog({
        userId: user.id,
        tenantId,
        action: "user_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: `Please login using ${user.authProvider}`,
      });

      return res.status(400).json({
        status: "error",
        message: `Please login using ${user.authProvider}`,
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await publishAuditLog({
        userId: user.id,
        tenantId,
        action: "user_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: "Invalid password",
      });

      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    // Generate tokens
    const tokens = generateTokens({
      ...user,
      tenantId,
    });

    await publishAuditLog({
      userId: user.id,
      tenantId,
      action: "user_login",
      status: "success",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        ...tokens,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred during login",
    });
  }
});

// Super admin login endpoint
app.post("/super-admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    // Find super admin
    const [admins] = await masterPool.query(
      "SELECT * FROM super_admins WHERE email = ?",
      [email]
    );

    if (admins.length === 0) {
      await publishAuditLog({
        userId: null,
        tenantId: null,
        action: "super_admin_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: "Admin not found",
      });

      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    const admin = admins[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      await publishAuditLog({
        userId: admin.id,
        tenantId: null,
        action: "super_admin_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: "Invalid password",
      });

      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    // Generate tokens
    const tokens = generateTokens({
      ...admin,
      role: "superAdmin",
    });

    await publishAuditLog({
      userId: admin.id,
      tenantId: null,
      action: "super_admin_login",
      status: "success",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(200).json({
      status: "success",
      message: "Super admin login successful",
      data: {
        user: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: "superAdmin",
        },
        ...tokens,
      },
    });
  } catch (error) {
    console.error("Super admin login error:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred during login",
    });
  }
});

// Refresh token endpoint
app.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: "error",
        message: "Refresh token is required",
      });
    }

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

      // Generate new tokens
      const tokens = generateTokens(decoded);

      res.status(200).json({
        status: "success",
        message: "Token refreshed successfully",
        data: tokens,
      });
    } catch (error) {
      return res.status(401).json({
        status: "error",
        message: "Invalid or expired refresh token",
      });
    }
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred during token refresh",
    });
  }
});

// OAuth routes
app.get("/google", (req, res, next) => {
  const tenantId = req.query.tenantId;
  if (!tenantId) {
    return res.status(400).json({
      status: "error",
      message: "Tenant ID is required for OAuth login",
    });
  }

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: tenantId,
  })(req, res, next);
});

app.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login-failed",
  }),
  (req, res) => {
    // Generate tokens
    const tokens = generateTokens(req.user);

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const redirectUrl = `${frontendUrl}/oauth-callback?accessToken=${encodeURIComponent(
      tokens.accessToken
    )}&refreshToken=${encodeURIComponent(tokens.refreshToken)}`;

    res.redirect(redirectUrl);
  }
);

app.get("/login-failed", (req, res) => {
  res.status(401).json({
    status: "error",
    message: "OAuth authentication failed",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});

// Handle process termination
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await producer.disconnect();
  process.exit(0);
});
