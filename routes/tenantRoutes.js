const express = require("express");
const tenantController = require("../controllers/tenantController");
const auditController = require("../controllers/auditController");
const {
  authenticateUser,
  isSuperAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateUser);

router.use(isSuperAdmin);

router.post("/", tenantController.createTenant);
router.get("/", tenantController.getAllTenants);
router.get("/:id", tenantController.getTenantById);
router.patch("/:id", tenantController.updateTenant);
router.delete("/:id", tenantController.deleteTenant);

router.get("/audit/failed-logins", auditController.getAllFailedLogins);
router.get(
  "/audit/:tenantId/failed-logins",
  auditController.getTenantFailedLogins
);
router.get("/audit/:tenantId/logs", auditController.getTenantAuditLogs);

module.exports = router;
