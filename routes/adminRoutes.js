const express = require("express");
const adminController = require("../controllers/adminController");
const {
  authenticateUser,
  isSuperAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateUser);
router.use(isSuperAdmin);

router.post("/tenant-admin", adminController.createTenantAdmin);
router.post("/tenant-with-admin", adminController.createTenantWithAdmin);

module.exports = router;
