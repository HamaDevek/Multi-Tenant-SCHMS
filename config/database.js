const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const uuid = require("uuid");
const crypto = require("crypto");

// Master connection pool
const masterPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_MASTER,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Tenant connection pools
const tenantPools = {};

// Function to get connection pool for a specific tenant
const getTenantConnection = async (tenantId) => {
  if (!tenantId) {
    throw new Error("Tenant ID is required");
  }

  if (!tenantPools[tenantId]) {
    const [rows] = await masterPool.query(
      "SELECT * FROM tenants WHERE id = ?",
      [tenantId]
    );

    if (rows.length === 0) {
      throw new Error(`Tenant with id ${tenantId} not found`);
    }

    const tenant = rows[0];
    // Sanitize tenant ID for database name (replace hyphens with underscores)
    const sanitizedId = tenantId.replace(/-/g, "_");
    const dbName = `school_${sanitizedId}`;

    // Create a new connection pool for this tenant
    tenantPools[tenantId] = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }

  return tenantPools[tenantId];
};

// Generate a secure random password
const generateSecurePassword = (length = 12) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  let password = "";
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes[i] % chars.length;
    password += chars.charAt(randomIndex);
  }

  return password;
};

// Initialize master database with needed tables
const initializeDatabase = async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${process.env.DB_MASTER}`
    );

    await connection.query(`USE ${process.env.DB_MASTER}`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) UNIQUE NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        firstName VARCHAR(255),
        lastName VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36),
        action VARCHAR(255) NOT NULL,
        status ENUM('success', 'failure') NOT NULL,
        ipAddress VARCHAR(45),
        userAgent TEXT,
        details TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [superAdmins] = await connection.query(
      "SELECT * FROM super_admins LIMIT 1"
    );
    if (superAdmins.length === 0) {
      const defaultPassword =
        process.env.NODE_ENV === "development"
          ? "admin123"
          : generateSecurePassword(16);
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      await connection.query(
        `
        INSERT INTO super_admins (id, email, password, firstName, lastName)
        VALUES (?, ?, ?, ?, ?)
      `,
        [uuid.v4(), "admin@example.com", hashedPassword, "Super", "Admin"]
      );

      console.log("Default super admin created:");
      console.log(`Email: admin@example.com`);
      console.log(`Password: ${defaultPassword}`);
      console.log(
        "IMPORTANT: Change this password immediately after first login!"
      );
    }

    console.log("Master database initialized successfully");
    connection.end();
  } catch (error) {
    console.error("Database initialization error:", error);
    process.exit(1);
  }
};

// Function to create a new tenant database
const createTenantDatabase = async (tenantId, tenantName) => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    const sanitizedId = tenantId.replace(/-/g, "_");
    const dbName = `school_${sanitizedId}`;

    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);

    await connection.query(`USE ${dbName}`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        firstName VARCHAR(255),
        lastName VARCHAR(255),
        role ENUM('admin', 'student') NOT NULL,
        authProvider ENUM('local', 'google', 'outlook') DEFAULT 'local',
        authProviderId VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36),
        action VARCHAR(255) NOT NULL,
        status ENUM('success', 'failure') NOT NULL,
        ipAddress VARCHAR(45),
        userAgent TEXT,
        details TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_profiles (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        grade VARCHAR(50),
        dateOfBirth DATE,
        address TEXT,
        phoneNumber VARCHAR(20),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    const adminPassword =
      process.env.NODE_ENV === "development"
        ? "tenant123"
        : generateSecurePassword(16);
    const adminId = uuid.v4();
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminEmail = `admin@${tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}.com`;

    await connection.query("START TRANSACTION");

    try {
      await connection.query(
        `
        INSERT INTO users (id, email, password, firstName, lastName, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [adminId, adminEmail, hashedPassword, "Tenant", "Admin", "admin"]
      );

      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    }

    console.log(`Tenant database for ${tenantName} created successfully`);

    return {
      id: tenantId,
      name: tenantName,
      adminEmail: adminEmail,
      adminPassword: adminPassword,
      note:
        process.env.NODE_ENV === "production"
          ? "Save this password, it won't be shown again!"
          : null,
    };
  } catch (error) {
    console.error(`Error creating tenant database for ${tenantName}:`, error);
    throw error;
  } finally {
    if (connection) {
      connection.end();
    }
  }
};

module.exports = {
  masterPool,
  getTenantConnection,
  initializeDatabase,
  createTenantDatabase,
};
