const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { createProxyMiddleware } = require("http-proxy-middleware");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
});

app.use(globalRateLimiter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    gateway: "online",
    timestamp: new Date().toISOString(),
  });
});

// Token verification middleware
const verifyToken = (req, res, next) => {
  if (req.path.startsWith("/api/auth") && req.method === "POST") {
    return next();
  }

  if (
    req.path.startsWith("/api/auth/google") ||
    req.path.startsWith("/api/auth/outlook")
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token",
    });
  }
};

// Circuit breaker implementation
const circuitBreaker = {
  auth: {
    failures: 0,
    lastFailureTime: null,
    isOpen: false,
    threshold: 5,
    resetTimeout: 30000, // 30 seconds
  },
  tenant: {
    failures: 0,
    lastFailureTime: null,
    isOpen: false,
    threshold: 5,
    resetTimeout: 30000,
  },
  audit: {
    failures: 0,
    lastFailureTime: null,
    isOpen: false,
    threshold: 5,
    resetTimeout: 30000,
  },
};

const checkCircuitBreaker = (service) => {
  const breaker = circuitBreaker[service];

  if (breaker.isOpen) {
    if (Date.now() - breaker.lastFailureTime > breaker.resetTimeout) {
      breaker.isOpen = false;
      breaker.failures = 0;
      console.log(`Circuit breaker for ${service} service reset`);
      return true;
    }
    return false;
  }
  return true;
};

const handleProxyError = (service, err, req, res) => {
  const breaker = circuitBreaker[service];
  breaker.failures++;
  breaker.lastFailureTime = Date.now();

  if (breaker.failures >= breaker.threshold) {
    breaker.isOpen = true;
    console.log(`Circuit breaker opened for ${service} service`);
  }

  res.status(503).json({
    status: "error",
    message: `${service} service unavailable`,
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

// Service proxies with circuit breaker
const createServiceProxy = (path, serviceUrl, service) => {
  return (req, res, next) => {
    if (!checkCircuitBreaker(service)) {
      return res.status(503).json({
        status: "error",
        message: `${service} service temporarily unavailable. Please try again later.`,
      });
    }

    createProxyMiddleware({
      target: serviceUrl,
      changeOrigin: true,
      pathRewrite: {
        [`^/api/${path}`]: "",
      },
      onError: (err, req, res) => handleProxyError(service, err, req, res),
    })(req, res, next);
  };
};

app.use(
  "/api/auth",
  createServiceProxy("auth", process.env.AUTH_SERVICE_URL, "auth")
);
app.use(
  "/api/tenants",
  verifyToken,
  createServiceProxy("tenants", process.env.TENANT_SERVICE_URL, "tenant")
);
app.use(
  "/api/users",
  verifyToken,
  createServiceProxy("users", process.env.TENANT_SERVICE_URL, "tenant")
);
app.use(
  "/api/admin",
  verifyToken,
  createServiceProxy("admin", process.env.TENANT_SERVICE_URL, "tenant")
);
app.use(
  "/api/audit",
  verifyToken,
  createServiceProxy("audit", process.env.AUDIT_SERVICE_URL, "audit")
);

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Resource not found",
  });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
