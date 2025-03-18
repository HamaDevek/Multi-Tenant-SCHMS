const userService = require("../services/userService");

// Get all users (for a specific tenant)
const getAllUsers = async (req, res, next) => {
  try {
    const tenantId = req.headers["x-tenant-id"];

    const users = await userService.getAllUsers(tenantId);

    res.status(200).json({
      status: "success",
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

// Get user by ID
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers["x-tenant-id"];

    if (
      req.user.id !== id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to access this user profile",
      });
    }

    const user = await userService.getUserById(tenantId, id);

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// Update user
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers["x-tenant-id"];
    const updateData = req.body;

    if (
      req.user.id !== id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to update this user profile",
      });
    }

    if (req.user.role === "student" && updateData.role) {
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to change your role",
      });
    }

    const user = await userService.updateUser(tenantId, id, updateData);

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    if (error.message.includes("duplicate")) {
      return res.status(409).json({
        status: "error",
        message: "Email already in use",
      });
    }

    next(error);
  }
};

// Delete user
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers["x-tenant-id"];

    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to delete users",
      });
    }

    await userService.deleteUser(tenantId, id);

    res.status(200).json({
      status: "success",
      message: "User deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
// Get student profile
const getStudentProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers["x-tenant-id"];

    if (
      req.user.id !== id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to access this student profile",
      });
    }

    if (req.user.role === "student" && req.user.id !== id) {
      return res.status(403).json({
        status: "error",
        message: "Students can only access their own profile",
      });
    }

    const profile = await userService.getStudentProfile(tenantId, id);

    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "Student profile not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// Update student profile
const updateStudentProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.headers["x-tenant-id"];
    const profileData = req.body;

    if (
      req.user.id !== id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        status: "error",
        message: "You are not authorized to update this student profile",
      });
    }

    if (req.user.role === "student" && req.user.id !== id) {
      return res.status(403).json({
        status: "error",
        message: "Students can only update their own profile",
      });
    }

    const profile = await userService.updateStudentProfile(
      tenantId,
      id,
      profileData
    );

    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "Student profile not found",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Student profile updated successfully",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getStudentProfile,
  updateStudentProfile,
};
