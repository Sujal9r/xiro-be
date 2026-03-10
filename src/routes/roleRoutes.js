import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { authorizePermissions } from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";

import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
} from "../controllers/roleController.js";

const router = express.Router();

router.use(protect);

router.get(
  "/admin/roles",
  authorizePermissions(PERMISSIONS.VIEW_ADMIN_ROLES),
  listRoles
);

router.post(
  "/admin/roles",
  authorizePermissions(PERMISSIONS.MANAGE_ROLES),
  createRole
);

router.put(
  "/admin/roles/:id",
  authorizePermissions(PERMISSIONS.MANAGE_ROLES),
  updateRole
);

router.delete(
  "/admin/roles/:id",
  authorizePermissions(PERMISSIONS.MANAGE_ROLES),
  deleteRole
);

export default router;
