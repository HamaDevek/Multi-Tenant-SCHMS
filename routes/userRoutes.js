const express = require("express");
const userController = require("../controllers/userController");
const {
  authenticateUser,
  isTenantAdmin,
} = require("../middleware/authMiddleware");
const {
  verifyTenant,
  enforceTenantIsolation,
} = require("../middleware/tenantMiddleware");

const router = express.Router();

router.use(authenticateUser);
router.use(verifyTenant);
router.use(enforceTenantIsolation);
router.use(isTenantAdmin);

router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.patch("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

router.get("/:id/profile", userController.getStudentProfile);
router.patch("/:id/profile", userController.updateStudentProfile);

module.exports = router;
