const bcrypt = require("bcryptjs");
const uuid = require("uuid");
const { getTenantConnection } = require("../config/database");

// Create a new user
const createUser = async (tenantId, userData, requestUser = null) => {
  const { email, password, firstName, lastName, role } = userData;

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  if (requestUser) {
    if (role === "admin") {
      if (requestUser.role !== "superAdmin" && requestUser.role !== "admin") {
        throw new Error("Unauthorized to create admin users");
      }

      if (requestUser.role === "admin" && requestUser.tenantId !== tenantId) {
        throw new Error("You can only create users for your own tenant");
      }
    }

    if (requestUser.role === "student") {
      throw new Error("Students cannot create users");
    }
  }

  const tenantDb = await getTenantConnection(tenantId);

  const [existingUsers] = await tenantDb.query(
    "SELECT * FROM users WHERE email = ?",
    [email]
  );

  if (existingUsers.length > 0) {
    throw new Error("Email already in use");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const userId = uuid.v4();
  const connection = await tenantDb.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO users (id, email, password, firstName, lastName, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, email, hashedPassword, firstName, lastName, role]
    );
    if (role === "student") {
      await connection.query(
        `INSERT INTO student_profiles (id, userId)
         VALUES (?, ?)`,
        [uuid.v4(), userId]
      );
    }

    await connection.commit();

    return {
      id: userId,
      email,
      firstName,
      lastName,
      role,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
// Get all users for a specific tenant
const getAllUsers = async (tenantId) => {
  const tenantDb = await getTenantConnection(tenantId);

  const [users] = await tenantDb.query(
    `SELECT id, email, firstName, lastName, role, authProvider, 
     createdAt, updatedAt FROM users`
  );

  return users;
};

// Get user by ID
const getUserById = async (tenantId, userId) => {
  const tenantDb = await getTenantConnection(tenantId);

  const [users] = await tenantDb.query(
    `SELECT id, email, firstName, lastName, role, authProvider, 
     createdAt, updatedAt FROM users WHERE id = ?`,
    [userId]
  );

  return users.length > 0 ? users[0] : null;
};

// Update user
const updateUser = async (tenantId, userId, updateData) => {
  const tenantDb = await getTenantConnection(tenantId);
  const user = await getUserById(tenantId, userId);

  if (!user) {
    return null;
  }

  const { email, firstName, lastName, role, password } = updateData;

  if (email && email !== user.email) {
    const [existingUsers] = await tenantDb.query(
      "SELECT * FROM users WHERE email = ? AND id != ?",
      [email, userId]
    );

    if (existingUsers.length > 0) {
      throw new Error("Email already in use");
    }
  }

  const updateFields = [];
  const updateValues = [];

  if (email) {
    updateFields.push("email = ?");
    updateValues.push(email);
  }

  if (firstName) {
    updateFields.push("firstName = ?");
    updateValues.push(firstName);
  }

  if (lastName) {
    updateFields.push("lastName = ?");
    updateValues.push(lastName);
  }

  if (role) {
    updateFields.push("role = ?");
    updateValues.push(role);
  }

  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    updateFields.push("password = ?");
    updateValues.push(hashedPassword);
  }

  if (updateFields.length === 0) {
    return user; 
  }

  updateValues.push(userId);

  await tenantDb.query(
    `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`,
    updateValues
  );

  return getUserById(tenantId, userId);
};

// Delete user
const deleteUser = async (tenantId, userId) => {
  const tenantDb = await getTenantConnection(tenantId);

  const user = await getUserById(tenantId, userId);

  if (!user) {
    throw new Error("User not found");
  }

  await tenantDb.query("DELETE FROM users WHERE id = ?", [userId]);

  return true;
};

// Get student profile
const getStudentProfile = async (tenantId, userId) => {
  const tenantDb = await getTenantConnection(tenantId);

  const user = await getUserById(tenantId, userId);

  if (!user) {
    return null;
  }

  if (user.role !== "student") {
    throw new Error("User is not a student");
  }

  const [profiles] = await tenantDb.query(
    `SELECT * FROM student_profiles WHERE userId = ?`,
    [userId]
  );

  if (profiles.length === 0) {
    return null;
  }

  return {
    ...user,
    profile: profiles[0],
  };
};

// Update student profile
const updateStudentProfile = async (tenantId, userId, profileData) => {
  const tenantDb = await getTenantConnection(tenantId);

  const user = await getUserById(tenantId, userId);

  if (!user) {
    return null;
  }

  if (user.role !== "student") {
    throw new Error("User is not a student");
  }

  const [profiles] = await tenantDb.query(
    `SELECT * FROM student_profiles WHERE userId = ?`,
    [userId]
  );

  if (profiles.length === 0) {
    return null;
  }

  const profileId = profiles[0].id;

  const { grade, dateOfBirth, address, phoneNumber } = profileData;

  const updateFields = [];
  const updateValues = [];

  if (grade) {
    updateFields.push("grade = ?");
    updateValues.push(grade);
  }

  if (dateOfBirth) {
    updateFields.push("dateOfBirth = ?");
    updateValues.push(dateOfBirth);
  }

  if (address) {
    updateFields.push("address = ?");
    updateValues.push(address);
  }

  if (phoneNumber) {
    updateFields.push("phoneNumber = ?");
    updateValues.push(phoneNumber);
  }

  if (updateFields.length === 0) {
    return getStudentProfile(tenantId, userId);
  }

  updateValues.push(profileId);

  // Update profile
  await tenantDb.query(
    `UPDATE student_profiles SET ${updateFields.join(", ")} WHERE id = ?`,
    updateValues
  );

  return getStudentProfile(tenantId, userId);
};

const findOrCreateOAuthUser = async (tenantId, userData) => {

};

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getStudentProfile,
  updateStudentProfile,
  findOrCreateOAuthUser,
};
