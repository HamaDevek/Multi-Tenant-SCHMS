const bcrypt = require("bcryptjs");
const uuid = require("uuid");
const { masterPool, getTenantConnection } = require("../config/database");
const {
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/jwtUtils");
const userService = require("./userService");

// Register a new user
const registerUser = async (tenantId, userData) => {
  return userService.createUser(tenantId, userData);
};

// Authenticate user
const authenticateUser = async (tenantId, email, password) => {
  if (!tenantId || !email || !password) {
    throw new Error("Tenant ID, email, and password are required");
  }

  try {
    const tenantDb = await getTenantConnection(tenantId);
    const [users] = await tenantDb.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      throw new Error("Invalid credentials");
    }

    const user = users[0];

    if (user.authProvider !== "local" && user.authProvider !== null) {
      throw new Error(`Please login using ${user.authProvider}`);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  } catch (error) {
    if (error.message === "Invalid credentials") {
      throw error;
    } else {
      console.error("Authentication error:", error);
      throw new Error("Authentication failed");
    }
  }
};

// Authenticate super admin
const authenticateSuperAdmin = async (email, password) => {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  try {
    const [admins] = await masterPool.query(
      "SELECT * FROM super_admins WHERE email = ?",
      [email]
    );

    if (admins.length === 0) {
      throw new Error("Invalid credentials");
    }

    const admin = admins[0];

    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
    };
  } catch (error) {
    if (error.message === "Invalid credentials") {
      throw error;
    } else {
      console.error("Super admin authentication error:", error);
      throw new Error("Authentication failed");
    }
  }
};

// Find or create user with OAuth
const findOrCreateOAuthUser = async (tenantId, userData) => {
  if (!tenantId || !userData || !userData.email) {
    throw new Error("Tenant ID and user email are required");
  }

  const { email, firstName, lastName, authProvider, authProviderId } = userData;

  try {
    const tenantDb = await getTenantConnection(tenantId);
    const connection = await tenantDb.getConnection();

    try {
      await connection.beginTransaction();

      const [existingUsers] = await connection.query(
        "SELECT * FROM users WHERE email = ? OR (authProvider = ? AND authProviderId = ?)",
        [email, authProvider, authProviderId]
      );

      if (existingUsers.length > 0) {
        const user = existingUsers[0];

        if (
          user.authProvider !== authProvider ||
          user.authProviderId !== authProviderId
        ) {
          await connection.query(
            "UPDATE users SET authProvider = ?, authProviderId = ? WHERE id = ?",
            [authProvider, authProviderId, user.id]
          );
        }

        await connection.commit();
        connection.release();

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName || firstName,
          lastName: user.lastName || lastName,
          role: user.role,
        };
      }

      const userId = uuid.v4();
      await connection.query(
        "INSERT INTO users (id, email, firstName, lastName, role, authProvider, authProviderId) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          email,
          firstName,
          lastName,
          "student",
          authProvider,
          authProviderId,
        ]
      );

      await connection.query(
        "INSERT INTO student_profiles (id, userId) VALUES (?, ?)",
        [uuid.v4(), userId]
      );

      await connection.commit();
      connection.release();

      return {
        id: userId,
        email,
        firstName,
        lastName,
        role: "student",
      };
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error("OAuth user creation error:", error);
    throw new Error("Failed to process OAuth login");
  }
};

// Refresh token
const refreshUserToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new Error("Refresh token is required");
  }

  try {
    const decoded = verifyToken(refreshToken);

    if (!decoded.id || !decoded.email) {
      throw new Error("Invalid token format");
    }

    if (decoded.tenantId) {
      try {
        const user = await userService.getUserById(
          decoded.tenantId,
          decoded.id
        );
        if (!user) {
          throw new Error("User not found");
        }
      } catch (error) {
        console.error("Error finding user during token refresh:", error);
        throw new Error("Invalid or expired refresh token");
      }
    } else {
      try {
        const [admins] = await masterPool.query(
          "SELECT * FROM super_admins WHERE id = ?",
          [decoded.id]
        );

        if (admins.length === 0) {
          throw new Error("Admin not found");
        }
      } catch (error) {
        console.error("Error finding admin during token refresh:", error);
        throw new Error("Invalid or expired refresh token");
      }
    }

    const accessToken = generateAccessToken(decoded);
    const newRefreshToken = generateRefreshToken(decoded);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    console.error("Token refresh error:", error);
    throw new Error("Invalid or expired refresh token");
  }
};

// Change password
const changePassword = async (userId, tenantId, oldPassword, newPassword) => {
  if (!userId || (!tenantId && !isSuperAdmin) || !oldPassword || !newPassword) {
    throw new Error(
      "User ID, tenant ID (for tenant users), and both passwords are required"
    );
  }

  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters long");
  }

  try {
    const isSuperAdmin = !tenantId;

    if (isSuperAdmin) {
      const [admins] = await masterPool.query(
        "SELECT * FROM super_admins WHERE id = ?",
        [userId]
      );

      if (admins.length === 0) {
        throw new Error("User not found");
      }

      const admin = admins[0];

      const isPasswordValid = await bcrypt.compare(oldPassword, admin.password);

      if (!isPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await masterPool.query(
        "UPDATE super_admins SET password = ? WHERE id = ?",
        [hashedPassword, userId]
      );
    } else {
      const tenantDb = await getTenantConnection(tenantId);

      const [users] = await tenantDb.query("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);

      if (users.length === 0) {
        throw new Error("User not found");
      }

      const user = users[0];

      if (user.authProvider !== "local" && user.authProvider !== null) {
        throw new Error(
          `Cannot change password for ${user.authProvider} account`
        );
      }

      const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

      if (!isPasswordValid) {
        throw new Error("Current password is incorrect");
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await tenantDb.query("UPDATE users SET password = ? WHERE id = ?", [
        hashedPassword,
        userId,
      ]);
    }

    return { success: true, message: "Password changed successfully" };
  } catch (error) {
    if (
      error.message === "User not found" ||
      error.message === "Current password is incorrect" ||
      error.message === "Cannot change password for OAuth account"
    ) {
      throw error;
    } else {
      console.error("Password change error:", error);
      throw new Error("Failed to change password");
    }
  }
};

module.exports = {
  registerUser,
  authenticateUser,
  authenticateSuperAdmin,
  findOrCreateOAuthUser,
  refreshUserToken,
  changePassword,
};
