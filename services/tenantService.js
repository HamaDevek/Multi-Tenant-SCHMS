const uuid = require("uuid");
const { masterPool, createTenantDatabase } = require("../config/database");

// Create a new tenant (school)
const createTenant = async (name, domain) => {
  const [existingTenants] = await masterPool.query(
    "SELECT * FROM tenants WHERE domain = ?",
    [domain]
  );

  if (existingTenants.length > 0) {
    throw new Error("Domain already in use");
  }

  const tenantId = uuid.v4();

  await masterPool.query(
    "INSERT INTO tenants (id, name, domain) VALUES (?, ?, ?)",
    [tenantId, name, domain]
  );

  const tenantInfo = await createTenantDatabase(tenantId, name);

  return tenantInfo;
};

const getAllTenants = async () => {
  const [tenants] = await masterPool.query("SELECT * FROM tenants");
  return tenants;
};

const getTenantById = async (id) => {
  const [tenants] = await masterPool.query(
    "SELECT * FROM tenants WHERE id = ?",
    [id]
  );

  return tenants.length > 0 ? tenants[0] : null;
};

// Update tenant
const updateTenant = async (id, data) => {
  const { name, domain } = data;

  const tenant = await getTenantById(id);

  if (!tenant) {
    return null;
  }

  if (domain && domain !== tenant.domain) {
    const [existingTenants] = await masterPool.query(
      "SELECT * FROM tenants WHERE domain = ? AND id != ?",
      [domain, id]
    );

    if (existingTenants.length > 0) {
      throw new Error("Domain already in use");
    }
  }

  const updateFields = [];
  const updateValues = [];

  if (name) {
    updateFields.push("name = ?");
    updateValues.push(name);
  }

  if (domain) {
    updateFields.push("domain = ?");
    updateValues.push(domain);
  }

  if (updateFields.length === 0) {
    return tenant; 
  }

  updateValues.push(id);

  await masterPool.query(
    `UPDATE tenants SET ${updateFields.join(", ")} WHERE id = ?`,
    updateValues
  );

  return getTenantById(id);
};

// Delete tenant
const deleteTenant = async (id) => {
  const tenant = await getTenantById(id);

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  await masterPool.query("DELETE FROM tenants WHERE id = ?", [id]);

  const connection = await require("mysql2/promise").createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  // Sanitize tenant ID for database name (replace hyphens with underscores)
  const sanitizedId = id.replace(/-/g, "_");
  await connection.query(`DROP DATABASE IF EXISTS school_${sanitizedId}`);
  connection.end();

  return true;
};

module.exports = {
  createTenant,
  getAllTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
};
