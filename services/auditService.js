const uuid = require("uuid");
const { getTenantConnection, masterPool } = require("../config/database");

// Record an audit log entry for a specific tenant
const recordAuditLog = async (auditData) => {
  const { userId, tenantId, action, status, ipAddress, userAgent, details } =
    auditData;

  if (!tenantId) {
    await masterPool.query(
      `INSERT INTO audit_logs (id, userId, action, status, ipAddress, userAgent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid.v4(), userId, action, status, ipAddress, userAgent, details]
    );
    return;
  }

  try {
    const tenantDb = await getTenantConnection(tenantId);

    await tenantDb.query(
      `INSERT INTO audit_logs (id, userId, action, status, ipAddress, userAgent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid.v4(), userId, action, status, ipAddress, userAgent, details]
    );
  } catch (error) {
    console.error(`Error recording audit log for tenant ${tenantId}:`, error);
  }
};

const getFailedLogins = async (tenantId) => {
  const tenantDb = await getTenantConnection(tenantId);

  const [logs] = await tenantDb.query(
    `SELECT * FROM audit_logs 
     WHERE action = 'user_login' AND status = 'failure'
     ORDER BY createdAt DESC`
  );

  return logs;
};

const getAllFailedLogins = async () => {
  // Get all tenants
  const [tenants] = await masterPool.query("SELECT * FROM tenants");

  const allFailedLogins = [];

  for (const tenant of tenants) {
    try {
      const failedLogins = await getFailedLogins(tenant.id);

      const logsWithTenant = failedLogins.map((log) => ({
        ...log,
        tenantName: tenant.name,
        tenantId: tenant.id,
      }));

      allFailedLogins.push(...logsWithTenant);
    } catch (error) {
      console.error(
        `Error getting failed logins for tenant ${tenant.id}:`,
        error
      );
    }
  }

  allFailedLogins.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return allFailedLogins;
};

const getTenantAuditLogs = async (tenantId, filters) => {
  const { action, status, startDate, endDate, limit = 100, page = 1 } = filters;

  try {
    const tenantDb = await getTenantConnection(tenantId);

    let query = `SELECT * FROM audit_logs WHERE 1=1`;
    const queryParams = [];

    if (action) {
      query += ` AND action = ?`;
      queryParams.push(action);
    }

    if (status) {
      query += ` AND status = ?`;
      queryParams.push(status);
    }

    if (startDate) {
      query += ` AND createdAt >= ?`;
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ` AND createdAt <= ?`;
      queryParams.push(endDate);
    }

    query += ` ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit, 10));
    queryParams.push((parseInt(page, 10) - 1) * parseInt(limit, 10));

    const [logs] = await tenantDb.query(query, queryParams);

    return logs;
  } catch (error) {
    console.error(`Error getting audit logs for tenant ${tenantId}:`, error);
    throw error;
  }
};

module.exports = {
  recordAuditLog,
  getFailedLogins,
  getAllFailedLogins,
  getTenantAuditLogs,
};
