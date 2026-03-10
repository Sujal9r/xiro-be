import Role from "../models/Role.js";
import { expandPermissions } from "./roles.js";

export const resolveUserPermissions = async (user) => {
  if (!user) return [];

  try {
    if (user.role === "superadmin") {
      return expandPermissions(["*"]);
    }

    let roleDoc = null;

    if (user.customRole) {
      if (user.customRole.permissions) {
        roleDoc = user.customRole;
      } else {
        roleDoc = await Role.findById(user.customRole).select("permissions");
      }
    } else if (user.role) {
      roleDoc = await Role.findOne({ key: user.role }).select("permissions");
    }

    return expandPermissions(roleDoc?.permissions || []);
  } catch (error) {
    console.error("Error resolving permissions:", error);
    return [];
  }
};
