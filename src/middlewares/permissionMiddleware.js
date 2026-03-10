import { resolveUserPermissions } from "../utils/permissions.js";

export const authorizePermissions = (...required) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const permissions = await resolveUserPermissions(req.user);
      const hasAll = required.every((perm) => permissions.includes(perm));

      if (!hasAll) {
        return res.status(403).json({ message: "Access denied" });
      }

      req.userPermissions = permissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: "Permission check failed" });
    }
  };
};

export const authorizeAnyPermissions = (...required) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const permissions = await resolveUserPermissions(req.user);
      const hasAny = required.some((perm) => permissions.includes(perm));

      if (!hasAny) {
        return res.status(403).json({ message: "Access denied" });
      }

      req.userPermissions = permissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: "Permission check failed" });
    }
  };
};
