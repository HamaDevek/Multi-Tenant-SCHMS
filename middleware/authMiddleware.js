const { verifyToken } = require("../utils/jwtUtils");
const { masterPool } = require("../config/database");
const auditProducer = require("../queue/producer");

// Helper function to check if a user is a super admin
const isSuperAdminCheck = async (userId) => {
  if (!userId) return false;

  const [superAdmins] = await masterPool.query(
    "SELECT * FROM super_admins WHERE id = ?",
    [userId]
  );

  return superAdmins.length > 0;
};

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required. Please log in.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = verifyToken(token);

    req.user = decoded;

    req.superAdmin = await isSuperAdminCheck(decoded.id);

    auditProducer
      .logAudit({
        userId: decoded.id,
        tenantId: decoded.tenantId,
        action: "token_validation",
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      })
      .catch((err) => {
        console.error("Failed to log audit event:", err);
      });

    next();
  } catch (error) {
    auditProducer
      .logAudit({
        userId: null,
        tenantId: req.headers["x-tenant-id"] || null,
        action: "token_validation",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => {
        console.error("Failed to log audit event:", err);
      });

    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token. Please log in again.",
    });
  }
};

// Middleware to check if user is super admin
const isSuperAdmin = async (req, res, next) => {
  try {
    if (req.superAdmin) {
      return next();
    }

    const { id } = req.user;

    const isSuperAdmin = await isSuperAdminCheck(id);

    if (!isSuperAdmin) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Super Admin privileges required.",
      });
    }

    req.superAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check if user is tenant admin
const isTenantAdmin = async (req, res, next) => {
  try {
    const { id, role, tenantId } = req.user;

    if (req.superAdmin || (await isSuperAdminCheck(id))) {
      req.superAdmin = true;
      return next();
    }

    if (role !== "admin" || req.headers["x-tenant-id"] !== tenantId) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Tenant Admin privileges required.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
// Middleware to check if user is a student
const isStudent = async (req, res, next) => {
  try {
    const { role } = req.user;

    if (role !== "student") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Student privileges required.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticateUser,
  isSuperAdmin,
  isTenantAdmin,
  isStudent,
};
