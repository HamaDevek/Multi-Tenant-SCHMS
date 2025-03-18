const Bull = require("bull");

// Create a Bull queue for audit logs with Redis connection options
const createAuditQueue = () => {
  try {
    return new Bull("audit-logs", {
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });
  } catch (error) {
    console.error("Failed to create audit queue:", error);
    return {
      add: (data) => {
        console.log("Audit log (Redis unavailable):", data);
        return Promise.resolve();
      },
      on: () => {},
    };
  }
};

const auditQueue = createAuditQueue();

const logAudit = async (auditData) => {
  try {
    await auditQueue.add(auditData);
    return true;
  } catch (error) {
    console.error("Failed to add audit job to queue:", error);
    console.log("Fallback audit log:", auditData);
    return false;
  }
};

// Handle queue errors
auditQueue.on("error", (error) => {
  console.error("Audit queue error:", error);
});

// Handle failed jobs
auditQueue.on("failed", (job, error) => {
  console.error(`Audit job ${job.id} failed:`, error);
});

module.exports = {
  logAudit,
  auditQueue,
};
