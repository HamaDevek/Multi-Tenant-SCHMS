class AuditLog {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId || null;
    this.action = data.action;
    this.status = data.status;
    this.ipAddress = data.ipAddress || null;
    this.userAgent = data.userAgent || null;
    this.details = data.details || null;
    this.createdAt = data.createdAt || new Date();

    if (data.tenantId) {
      this.tenantId = data.tenantId;
    }

    if (data.tenantName) {
      this.tenantName = data.tenantName;
    }
  }

  toJSON() {
    const log = {
      id: this.id,
      userId: this.userId,
      action: this.action,
      status: this.status,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      createdAt: this.createdAt,
    };

    if (this.details) {
      log.details = this.details;
    }

    if (this.tenantId) {
      log.tenantId = this.tenantId;
    }

    if (this.tenantName) {
      log.tenantName = this.tenantName;
    }

    return log;
  }

  isFailure() {
    return this.status === "failure";
  }

  isAuthEvent() {
    return (
      this.action.includes("login") ||
      this.action.includes("token") ||
      this.action.includes("oauth")
    );
  }
}

module.exports = AuditLog;
