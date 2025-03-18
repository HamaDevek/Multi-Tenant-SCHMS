const auditService = require("../services/auditService");

// Get all failed login attempts across all tenants (for super admin)
const getAllFailedLogins = async (req, res, next) => {
  try {
    const failedLogins = await auditService.getAllFailedLogins();

    res.status(200).json({
      status: "success",
      data: failedLogins,
    });
  } catch (error) {
    next(error);
  }
};

// Get failed login attempts for a specific tenant
const getTenantFailedLogins = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const failedLogins = await auditService.getFailedLogins(tenantId);

    res.status(200).json({
      status: "success",
      data: failedLogins,
    });
  } catch (error) {
    next(error);
  }
};

// Get all audit logs for a specific tenant (with filtering options)
const getTenantAuditLogs = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { action, status, startDate, endDate, limit, page } = req.query;

    const filters = {
      action,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      page: page ? parseInt(page, 10) : 1,
    };

    const auditLogs = await auditService.getTenantAuditLogs(tenantId, filters);

    res.status(200).json({
      status: "success",
      data: auditLogs,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllFailedLogins,
  getTenantFailedLogins,
  getTenantAuditLogs,
};
