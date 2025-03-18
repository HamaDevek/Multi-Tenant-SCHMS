const { masterPool } = require("../config/database");

// Middleware to verify tenant exists
const verifyTenant = async (req, res, next) => {
  try {
    const tenantId = req.headers["x-tenant-id"];

    if (!tenantId) {
      return res.status(400).json({
        status: "error",
        message: "Tenant ID is required in the headers (x-tenant-id)",
      });
    }

    const [tenants] = await masterPool.query(
      "SELECT * FROM tenants WHERE id = ?",
      [tenantId]
    );

    if (tenants.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Tenant not found",
      });
    }

    req.tenant = tenants[0];
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to ensure user belongs to the tenant they're trying to access
const enforceTenantIsolation = async (req, res, next) => {
  try {
    if (req.superAdmin) {
      return next();
    }

    const userTenantId = req.user.tenantId;
    const requestedTenantId = req.headers["x-tenant-id"] || req.params.tenantId;

    if (userTenantId !== requestedTenantId) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only access your own tenant data.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyTenant,
  enforceTenantIsolation,
};
