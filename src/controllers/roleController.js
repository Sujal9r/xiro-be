import Role from "../models/Role.js";
import User from "../models/User.js";
import { ALL_PERMISSIONS, expandPermissions, normalizeRoleKey, roleKeyFromName } from "../utils/roles.js";

const serializeRole = (roleDoc) => ({
  id: roleDoc._id.toString(),
  key: roleDoc.key,
  name: roleDoc.name,
  permissions: roleDoc.permissions || [],
  isSystem: false,
});

export const listRoles = async (req, res) => {
  try {
    const customRoles = await Role.find().sort({ createdAt: -1 });
    res.json({
      roles: customRoles.map(serializeRole),
      availablePermissions: ALL_PERMISSIONS,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch roles" });
  }
};

export const createRole = async (req, res) => {
  try {
    const { name, key, permissions } = req.body;
    if (!name || !name.toString().trim()) {
      return res.status(400).json({ message: "Role name is required" });
    }

    const derivedKey = key ? normalizeRoleKey(key) : roleKeyFromName(name);
    if (!derivedKey) {
      return res.status(400).json({ message: "Role key is invalid" });
    }

    const trimmedName = name.toString().trim();
    const existingName = await Role.findOne({ name: trimmedName }).select("_id key");
    if (existingName) {
      return res.status(400).json({ message: "Role name already exists" });
    }

    const existing = await Role.findOne({ key: derivedKey });
    if (existing) {
      return res.status(400).json({ message: "Role already exists" });
    }

    const filteredPermissions = Array.isArray(permissions)
      ? permissions.filter((perm) => ALL_PERMISSIONS.includes(perm))
      : [];

    const role = await Role.create({
      name: trimmedName,
      key: derivedKey,
      slug: derivedKey,
      permissions: filteredPermissions,
      isSystem: false,
    });

    res.status(201).json({ role: serializeRole(role) });
  } catch (error) {
    res.status(500).json({ message: "Failed to create role" });
  }
};

export const updateRole = async (req, res) => {
  try {
    const roleId = req.params.id;

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    const { name, permissions } = req.body;
    if (name && name.toString().trim()) {
      role.name = name.toString().trim();
    }

    if (!role.slug && role.key) {
      role.slug = role.key;
    }

    if (Array.isArray(permissions)) {
      role.permissions = permissions.filter((perm) => ALL_PERMISSIONS.includes(perm));
    }

    await role.save();

    res.json({ role: serializeRole(role) });
  } catch (error) {
    res.status(500).json({ message: "Failed to update role" });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const roleId = req.params.id;
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    const assignedUser = await User.findOne({ customRole: role._id }).select("_id");
    if (assignedUser) {
      return res
        .status(400)
        .json({ message: "Role is assigned to users. Reassign users first." });
    }

    await Role.findByIdAndDelete(roleId);
    res.json({ message: "Role deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete role" });
  }
};
