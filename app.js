const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const passport = require("passport");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");

// middlewares
const { globalRateLimiter } = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Security
app.use(helmet());

// CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
  credentials: true,
};
app.use(cors(corsOptions));

// Rate limiting
app.use(globalRateLimiter);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Passport
app.use(passport.initialize());
require("./config/auth");

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);

// API IS RUNNING
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// 404
app.use((req, res, next) => {
  res.status(404).json({
    status: "error",
    message: "Resource not found",
  });
});

app.use(errorHandler);

module.exports = app;
