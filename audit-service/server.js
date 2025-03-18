const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Kafka } = require("kafkajs");
const mysql = require("mysql2/promise");
const uuid = require("uuid");

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Database connection
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_MASTER,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const masterPool = mysql.createPool(dbConfig);

// Kafka consumer setup
const kafka = new Kafka({
  clientId: "audit-service",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

const consumer = kafka.consumer({ groupId: "audit-service-group" });

// Get tenant connection
const getTenantConnection = async (tenantId) => {
  if (!tenantId) {
    throw new Error("Tenant ID is required");
  }

  const [rows] = await masterPool.query("SELECT * FROM tenants WHERE id = ?", [
    tenantId,
  ]);

  if (rows.length === 0) {
    throw new Error(`Tenant with id ${tenantId} not found`);
  }

  // Sanitize tenant ID for database name
  const sanitizedId = tenantId.replace(/-/g, "_");
  const dbName = `school_${sanitizedId}`;

  // Create a connection to the tenant database
  const tenantDb = mysql.createPool({
    ...dbConfig,
    database: dbName,
    connectionLimit: 5,
  });

  return tenantDb;
};

// Connect to Kafka and consume messages
const connectAndConsume = async () => {
  try {
    await consumer.connect();
    console.log("Connected to Kafka");

    await consumer.subscribe({ topic: "audit-logs", fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const auditData = JSON.parse(message.value.toString());
          await storeAuditLog(auditData);
        } catch (error) {
          console.error("Error processing audit log:", error);
        }
      },
    });
  } catch (error) {
    console.error("Failed to connect to Kafka or consume messages:", error);
  }
};

connectAndConsume();

// Store audit log in the appropriate database
const storeAuditLog = async (auditData) => {
  const { userId, tenantId, action, status, ipAddress, userAgent, details } =
    auditData;
  const logId = uuid.v4();

  try {
    if (!tenantId) {
      await masterPool.query(
        `INSERT INTO audit_logs (id, userId, action, status, ipAddress, userAgent, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [logId, userId, action, status, ipAddress, userAgent, details]
      );
    } else {
      try {
        const tenantDb = await getTenantConnection(tenantId);
        await tenantDb.query(
          `INSERT INTO audit_logs (id, userId, action, status, ipAddress, userAgent, details)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [logId, userId, action, status, ipAddress, userAgent, details]
        );
      } catch (error) {
        console.error(`Error storing audit log for tenant ${tenantId}:`, error);
        await masterPool.query(
          `INSERT INTO audit_logs (id, userId, action, status, ipAddress, userAgent, details)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            logId,
            userId,
            action,
            status,
            ipAddress,
            userAgent,
            `Tenant ${tenantId}: ${details || "No details"}`,
          ]
        );
      }
    }
    console.log(`Audit log stored: ${action} by ${userId || "anonymous"}`);
  } catch (error) {
    console.error("Error storing audit log:", error);
  }
};

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "audit-service",
    timestamp: new Date().toISOString(),
  });
});

// Get failed logins across all tenants
app.get("/failed-logins", async (req, res) => {
  try {
    const [tenants] = await masterPool.query("SELECT * FROM tenants");

    const allFailedLogins = [];

    const [masterLogs] = await masterPool.query(
      `SELECT * FROM audit_logs 
       WHERE action LIKE '%login%' AND status = 'failure'
       ORDER BY createdAt DESC`
    );

    allFailedLogins.push(
      ...masterLogs.map((log) => ({
        ...log,
        tenantName: "Master",
        tenantId: null,
      }))
    );

    for (const tenant of tenants) {
      try {
        const tenantDb = await getTenantConnection(tenant.id);

        const [logs] = await tenantDb.query(
          `SELECT * FROM audit_logs 
           WHERE action LIKE '%login%' AND status = 'failure'
           ORDER BY createdAt DESC`
        );

        const logsWithTenant = logs.map((log) => ({
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

    allFailedLogins.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.status(200).json({
      status: "success",
      data: allFailedLogins,
    });
  } catch (error) {
    console.error("Get all failed logins error:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while fetching failed logins",
    });
  }
});

// Get failed logins for a specific tenant
app.get("/:tenantId/failed-logins", async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenantDb = await getTenantConnection(tenantId);

    const [logs] = await tenantDb.query(
      `SELECT * FROM audit_logs 
       WHERE action LIKE '%login%' AND status = 'failure'
       ORDER BY createdAt DESC`
    );

    res.status(200).json({
      status: "success",
      data: logs,
    });
  } catch (error) {
    console.error(
      `Get failed logins for tenant ${req.params.tenantId} error:`,
      error
    );
    res.status(500).json({
      status: "error",
      message: "An error occurred while fetching failed logins",
    });
  }
});

// Get all audit logs for a specific tenant with filtering
app.get("/:tenantId/logs", async (req, res) => {
  try {
    const { tenantId } = req.params;
    const {
      action,
      status,
      startDate,
      endDate,
      limit = 100,
      page = 1,
    } = req.query;

    const tenantDb = await getTenantConnection(tenantId);

    let query = `SELECT * FROM audit_logs WHERE 1=1`;
    const params = [];

    if (action) {
      query += ` AND action = ?`;
      params.push(action);
    }

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (startDate) {
      query += ` AND createdAt >= ?`;
      params.push(new Date(startDate));
    }

    if (endDate) {
      query += ` AND createdAt <= ?`;
      params.push(new Date(endDate));
    }

    query += ` ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10));
    params.push((parseInt(page, 10) - 1) * parseInt(limit, 10));

    const [logs] = await tenantDb.query(query, params);

    res.status(200).json({
      status: "success",
      data: logs,
    });
  } catch (error) {
    console.error(
      `Get audit logs for tenant ${req.params.tenantId} error:`,
      error
    );
    res.status(500).json({
      status: "error",
      message: "An error occurred while fetching audit logs",
    });
  }
});

// Manual endpoint to publish audit logs (for testing)
app.post("/logs", async (req, res) => {
  try {
    const auditData = req.body;

    await storeAuditLog(auditData);

    res.status(201).json({
      status: "success",
      message: "Audit log created",
      data: auditData,
    });
  } catch (error) {
    console.error("Create audit log error:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while creating audit log",
    });
  }
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
  console.log(`Audit Service running on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await consumer.disconnect();
  process.exit(0);
});
