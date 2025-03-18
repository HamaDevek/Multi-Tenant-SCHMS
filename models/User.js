class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.firstName = data.firstName || null;
    this.lastName = data.lastName || null;
    this.role = data.role;
    this.authProvider = data.authProvider || "local";
    this.authProviderId = data.authProviderId || null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();

    if (data.password) {
      this._password = data.password;
    }
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      role: this.role,
      authProvider: this.authProvider,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  getFullName() {
    return `${this.firstName || ""} ${this.lastName || ""}`.trim();
  }

  isAdmin() {
    return this.role === "admin";
  }

  isStudent() {
    return this.role === "student";
  }
}

module.exports = User;
