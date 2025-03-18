class Tenant {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.domain = data.domain;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      domain: this.domain,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  getDatabaseName() {
    return `school_${this.id}`;
  }

  getDomainUrl() {
    return `https://${this.domain}`;
  }
}

module.exports = Tenant;
