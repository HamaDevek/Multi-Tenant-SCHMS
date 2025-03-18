const express = require("express");
const passport = require("passport");
const authController = require("../controllers/authController");
const { verifyTenant } = require("../middleware/tenantMiddleware");
const { authRateLimiter } = require("../middleware/rateLimiter");
const { authenticateUser } = require("../middleware/authMiddleware");

const router = express.Router();


router.post("/register", verifyTenant, authController.register);


router.post(
  "/register-user",
  authenticateUser,
  verifyTenant,
  authController.register
);

router.post("/login", authRateLimiter, verifyTenant, authController.login);
router.post(
  "/student/login",
  authRateLimiter,
  verifyTenant,
  authController.studentLogin
);
router.post(
  "/super-admin/login",
  authRateLimiter,
  authController.superAdminLogin
);
router.post("/refresh-token", authController.refreshToken);
router.post(
  "/change-password",
  authenticateUser,
  authController.changePassword
);

router.get("/google", (req, res, next) => {
  const tenantId = req.query.tenantId;
  if (!tenantId) {
    return res.status(400).json({
      status: "error",
      message: "Tenant ID is required for OAuth login",
    });
  }

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: tenantId,
  })(req, res, next);
});

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  authController.oauthCallback
);

router.get("/outlook", (req, res, next) => {
  const tenantId = req.query.tenantId;
  if (!tenantId) {
    return res.status(400).json({
      status: "error",
      message: "Tenant ID is required for OAuth login",
    });
  }

  passport.authenticate("microsoft", {
    scope: ["user.read", "profile", "email", "openid"],
    state: tenantId, 
  })(req, res, next);
});

router.get(
  "/outlook/callback",
  passport.authenticate("microsoft", {
    session: false,
    failureRedirect: "/login",
  }),
  authController.oauthCallback
);

module.exports = router;
