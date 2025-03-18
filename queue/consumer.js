const { auditQueue } = require("./producer");
const auditService = require("../services/auditService");

// Process audit log entries
auditQueue.process(async (job) => {
  const auditData = job.data;
  try {
    await auditService.recordAuditLog(auditData);
    console.log(
      `Audit log recorded: ${auditData.action} by ${
        auditData.userId || "anonymous"
      }`
    );
    return { success: true };
  } catch (error) {
    console.error("Error processing audit log:", error);
    throw error;
  }
});

// Handle completion
auditQueue.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed`);
});

auditQueue.on("failed", (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});

console.log("Audit log worker started");

module.exports = auditQueue;
