const bcrypt = require("bcryptjs");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/jwtUtils");
const authService = require("../services/authService");
const auditProducer = require("../queue/producer");
const { oauthRedirect } = require("../utils/oauthUtils");
const userService = require("../services/userService");
// Register a new user
const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    const tenantId = req.headers["x-tenant-id"];

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email format",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 8 characters long",
      });
    }

    if (role !== "admin" && role !== "student") {
      return res.status(400).json({
        status: "error",
        message: 'Role must be either "admin" or "student"',
      });
    }

    if (role === "admin") {
      if (!req.user) {
        return res.status(403).json({
          status: "error",
          message: "Unauthorized to create admin accounts",
        });
      }

      if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
        return res.status(403).json({
          status: "error",
          message: "Unauthorized to create admin accounts",
        });
      }

      if (req.user.role === "admin" && req.user.tenantId !== tenantId) {
        return res.status(403).json({
          status: "error",
          message: "You can only create accounts for your own tenant",
        });
      }
    }

    const user = await authService.registerUser(tenantId, {
      email,
      password,
      firstName,
      lastName,
      role,
    });

    auditProducer
      .logAudit({
        userId: user.id,
        tenantId,
        action: "user_registration",
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    res.status(201).json({
      status: "success",
      message: "User registered successfully",
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    auditProducer
      .logAudit({
        userId: null,
        tenantId: req.headers["x-tenant-id"],
        action: "user_registration",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    if (error.message.includes("Email already in use")) {
      return res.status(409).json({
        status: "error",
        message: "Email already in use",
      });
    }

    next(error);
  }
};
// Login user
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const tenantId = req.headers["x-tenant-id"];

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    const user = await authService.authenticateUser(tenantId, email, password);

    const accessToken = generateAccessToken({
      ...user,
      tenantId,
    });

    const refreshToken = generateRefreshToken({
      ...user,
      tenantId,
    });

    auditProducer
      .logAudit({
        userId: user.id,
        tenantId,
        action: "user_login",
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .catch((err) => console.error("Failed to log audit event:", err));

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
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    auditProducer
      .logAudit({
        userId: null,
        tenantId: req.headers["x-tenant-id"],
        action: "user_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    if (error.message === "Invalid credentials") {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    next(error);
  }
};

// Super admin login
const superAdminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    const admin = await authService.authenticateSuperAdmin(email, password);

    const accessToken = generateAccessToken({
      ...admin,
      role: "superAdmin",
    });

    const refreshToken = generateRefreshToken({
      ...admin,
      role: "superAdmin",
    });

    auditProducer
      .logAudit({
        userId: admin.id,
        tenantId: null,
        action: "super_admin_login",
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .catch((err) => console.error("Failed to log audit event:", err));

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
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    auditProducer
      .logAudit({
        userId: null,
        tenantId: null,
        action: "super_admin_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    if (error.message === "Invalid credentials") {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    next(error);
  }
};
// Refresh token
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: "error",
        message: "Refresh token is required",
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.log("Refresh token request received:", {
        tokenLength: refreshToken.length,
        tokenPrefix: refreshToken.substring(0, 10) + "...",
      });
    }

    try {
      const tokens = await authService.refreshUserToken(refreshToken);

      return res.status(200).json({
        status: "success",
        message: "Token refreshed successfully",
        data: tokens,
      });
    } catch (error) {
      console.error("Token refresh error:", error);

      return res.status(401).json({
        status: "error",
        message: "Invalid or expired refresh token",
      });
    }
  } catch (error) {
    next(error);
  }
};

// Change password
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        status: "error",
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "New password must be at least 8 characters long",
      });
    }

    await authService.changePassword(
      userId,
      tenantId,
      oldPassword,
      newPassword
    );

    auditProducer
      .logAudit({
        userId,
        tenantId,
        action: "password_change",
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    res.status(200).json({
      status: "success",
      message: "Password changed successfully",
    });
  } catch (error) {
    auditProducer
      .logAudit({
        userId: req.user ? req.user.id : null,
        tenantId: req.user ? req.user.tenantId : null,
        action: "password_change",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    if (error.message === "Current password is incorrect") {
      return res.status(400).json({
        status: "error",
        message: "Current password is incorrect",
      });
    }

    next(error);
  }
};

// OAuth callback handler
const oauthCallback = (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "OAuth authentication failed",
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Log successful login
    auditProducer
      .logAudit({
        userId: user.id,
        tenantId: user.tenantId,
        action: `${user.authProvider}_oauth_login`,
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const redirectUrl = `${frontendUrl}/oauth-callback?accessToken=${encodeURIComponent(
      accessToken
    )}&refreshToken=${encodeURIComponent(refreshToken)}`;

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("OAuth callback error:", error);
    auditProducer
      .logAudit({
        userId: null,
        tenantId: req.query.state || null,
        action: "oauth_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(
      `${frontendUrl}/login?error=${encodeURIComponent(
        "OAuth authentication failed"
      )}`
    );
  }
};
// Student login
const studentLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const tenantId = req.headers["x-tenant-id"];
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    const user = await authService.authenticateUser(tenantId, email, password);
    if (user.role !== "student") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Student login only.",
      });
    }
    const studentProfile = await userService.getStudentProfile(
      tenantId,
      user.id
    );

    const accessToken = generateAccessToken({
      ...user,
      tenantId,
    });

    const refreshToken = generateRefreshToken({
      ...user,
      tenantId,
    });

    auditProducer
      .logAudit({
        userId: user.id,
        tenantId,
        action: "student_login",
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    res.status(200).json({
      status: "success",
      message: "Student login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        profile: studentProfile ? studentProfile.profile : null,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    auditProducer
      .logAudit({
        userId: null,
        tenantId: req.headers["x-tenant-id"],
        action: "student_login",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    if (error.message === "Invalid credentials") {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    next(error);
  }
};

module.exports = {
  register,
  login,
  superAdminLogin,
  studentLogin,
  refreshToken,
  changePassword,
  oauthCallback,
};
