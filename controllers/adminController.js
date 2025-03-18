const userService = require("../services/userService");
const auditProducer = require("../queue/producer");
const { createTenantDatabase } = require("../config/database");

// Create a new admin for a tenant (only available to super admin)
const createTenantAdmin = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, tenantId } = req.body;

    if (!email || !password || !tenantId) {
      return res.status(400).json({
        status: "error",
        message: "Email, password, and tenantId are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email format",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 8 characters long",
      });
    }

    const user = await userService.createUser(tenantId, {
      email,
      password,
      firstName,
      lastName,
      role: "admin",
    });

    auditProducer
      .logAudit({
        userId: req.user.id,
        tenantId: null,
        action: "tenant_admin_creation",
        status: "success",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: `Created admin ${email} for tenant ${tenantId}`,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    res.status(201).json({
      status: "success",
      message: "Tenant admin created successfully",
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId,
      },
    });
  } catch (error) {
    auditProducer
      .logAudit({
        userId: req.user.id,
        tenantId: null,
        action: "tenant_admin_creation",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    if (error.message.includes("Email already in use")) {
      return res.status(409).json({
        status: "error",
        message: "Email already in use",
      });
    }

    next(error);
  }
};

// Create a new tenant with an admin (all in one operation)
const createTenantWithAdmin = async (req, res, next) => {
  try {
    const {
      name,
      domain,
      adminEmail,
      adminPassword,
      adminFirstName,
      adminLastName,
    } = req.body;

    if (!name || !domain || !adminEmail || !adminPassword) {
      return res.status(400).json({
        status: "error",
        message: "Tenant name, domain, and admin credentials are required",
      });
    }

    const tenantInfo = await require("../services/tenantService").createTenant(
      name,
      domain
    );

    try {
      const user = await userService.createUser(tenantInfo.id, {
        email: adminEmail,
        password: adminPassword,
        firstName: adminFirstName || "Tenant",
        lastName: adminLastName || "Admin",
        role: "admin",
      });

      auditProducer
        .logAudit({
          userId: req.user.id,
          tenantId: null,
          action: "tenant_creation_with_admin",
          status: "success",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          details: `Created tenant ${name} with admin ${adminEmail}`,
        })
        .catch((err) => console.error("Failed to log audit event:", err));

      res.status(201).json({
        status: "success",
        message: "Tenant and admin created successfully",
        data: {
          tenant: {
            id: tenantInfo.id,
            name,
            domain,
          },
          admin: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
        },
      });
    } catch (error) {
      throw new Error(
        `Tenant created but admin creation failed: ${error.message}`
      );
    }
  } catch (error) {
    auditProducer
      .logAudit({
        userId: req.user.id,
        tenantId: null,
        action: "tenant_creation_with_admin",
        status: "failure",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: error.message,
      })
      .catch((err) => console.error("Failed to log audit event:", err));

    if (error.message.includes("Domain already in use")) {
      return res.status(409).json({
        status: "error",
        message: "Domain already in use",
      });
    }

    next(error);
  }
};

module.exports = {
  createTenantAdmin,
  createTenantWithAdmin,
};
