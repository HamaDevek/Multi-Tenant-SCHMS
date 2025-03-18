const express = require("express");
const userController = require("../controllers/userController");
const { authenticateUser, isStudent } = require("../middleware/authMiddleware");
const {
  verifyTenant,
  enforceTenantIsolation,
} = require("../middleware/tenantMiddleware");

const router = express.Router();

router.use(authenticateUser);
router.use(verifyTenant);
router.use(enforceTenantIsolation);
router.use(isStudent);

router.get("/profile", async (req, res, next) => {
  try {
    req.params.id = req.user.id;

    await userController.getStudentProfile(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.patch("/profile", async (req, res, next) => {
  try {
    req.params.id = req.user.id;

    await userController.updateStudentProfile(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
