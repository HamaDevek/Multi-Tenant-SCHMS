const rateLimit = require("express-rate-limit");
const auditProducer = require("../queue/producer");

// Global rate limiter to protect against DDoS
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
  handler: (req, res, next, options) => {
    auditProducer.logAudit({
      userId: req.user ? req.user.id : null,
      tenantId: req.user
        ? req.user.tenantId
        : req.headers["x-tenant-id"] || null,
      action: "rate_limit_exceeded",
      status: "failure",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: "Global rate limit exceeded",
    });

    res.status(429).json({
      status: "error",
      message: options.message,
    });
  },
});

// More strict rate limiter for authentication
const authRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 login attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts, please try again after an hour",
  handler: (req, res, next, options) => {
    auditProducer.logAudit({
      userId: null,
      tenantId: req.headers["x-tenant-id"] || null,
      action: "brute_force_attempt",
      status: "failure",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: "Authentication rate limit exceeded",
    });

    res.status(429).json({
      status: "error",
      message: options.message,
    });
  },
  skipSuccessfulRequests: true,
});

module.exports = {
  globalRateLimiter,
  authRateLimiter,
};
