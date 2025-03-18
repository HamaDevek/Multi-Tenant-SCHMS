const tenantService = require("../services/tenantService");

// Create a new tenant (school)
const createTenant = async (req, res, next) => {
  try {
    const { name, domain } = req.body;

    const tenant = await tenantService.createTenant(name, domain);

    res.status(201).json({
      status: "success",
      message: "Tenant created successfully",
      data: tenant,
    });
  } catch (error) {
    if (error.message.includes("duplicate")) {
      return res.status(409).json({
        status: "error",
        message: "Domain already in use",
      });
    }

    next(error);
  }
};

// Get all tenants (schools)
const getAllTenants = async (req, res, next) => {
  try {
    const tenants = await tenantService.getAllTenants();

    res.status(200).json({
      status: "success",
      data: tenants,
    });
  } catch (error) {
    next(error);
  }
};

// Get tenant by ID
const getTenantById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const tenant = await tenantService.getTenantById(id);

    if (!tenant) {
      return res.status(404).json({
        status: "error",
        message: "Tenant not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: tenant,
    });
  } catch (error) {
    next(error);
  }
};

// Update tenant
const updateTenant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, domain } = req.body;

    const tenant = await tenantService.updateTenant(id, { name, domain });

    if (!tenant) {
      return res.status(404).json({
        status: "error",
        message: "Tenant not found",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Tenant updated successfully",
      data: tenant,
    });
  } catch (error) {
    if (error.message.includes("duplicate")) {
      return res.status(409).json({
        status: "error",
        message: "Domain already in use",
      });
    }

    next(error);
  }
};

// Delete tenant
const deleteTenant = async (req, res, next) => {
  try {
    const { id } = req.params;

    await tenantService.deleteTenant(id);

    res.status(200).json({
      status: "success",
      message: "Tenant deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTenant,
  getAllTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
};
