/**
 * Database initialization script
 *
 * This script sets up the master database and creates initial super admin user
 */

require("dotenv").config();
const { initializeDatabase } = require("../config/database");

console.log("Starting database initialization...");

// Initialize the master database with required tables
initializeDatabase()
  .then(() => {
    console.log(`Default super admin created: admin@example.com / admin123`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
