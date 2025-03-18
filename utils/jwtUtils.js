const jwt = require("jsonwebtoken");

// Generate access token
const generateAccessToken = (user) => {
  if (!user || !user.id) {
    throw new Error("Invalid user data for token generation");
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  if (user.tenantId) {
    payload.tenantId = user.tenantId;
  }

  if (user.firstName) payload.firstName = user.firstName;
  if (user.lastName) payload.lastName = user.lastName;

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m",
    issuer: "school-management-system",
    audience: "users",
  });
};

// Generate refresh token
const generateRefreshToken = (user) => {
  if (!user || !user.id) {
    throw new Error("Invalid user data for token generation");
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role, 
  };

  if (user.tenantId) {
    payload.tenantId = user.tenantId;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d",
    issuer: "school-management-system",
    audience: "users",
  });
};

const verifyToken = (token) => {
  try {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: "school-management-system",
        audience: "users",
      });
      return decoded;
    } catch (jwtError) {
      if (process.env.NODE_ENV === "development") {
        console.error("JWT verification error:", jwtError);
      }

      if (jwtError.name === "TokenExpiredError") {
        throw new Error("Token expired");
      } else if (jwtError.name === "JsonWebTokenError") {
        throw new Error("Invalid token");
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
};
