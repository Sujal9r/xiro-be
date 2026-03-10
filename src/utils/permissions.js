import Role from "../models/Role.js";
import { expandPermissions } from "./roles.js";

export const resolveUserPermissions = async (user) => {
  if (!user) return [];

  if (user.role === "superadmin") {
    return expandPermissions(["*"]);
  }

  const roleDoc =
    user.customRole && user.customRole.permissions
      ? user.customRole
      : user.customRole
      ? await Role.findById(user.customRole).select("permissions")
      : user.role
      ? await Role.findOne({ key: user.role }).select("permissions")
      : null;

  return expandPermissions(roleDoc?.permissions || []);
};
