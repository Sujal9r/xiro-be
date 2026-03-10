import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  authorizePermissions,
  authorizeAnyPermissions,
} from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";
import { getEmployees, getAttendance } from "../controllers/hrController.js";

const router = express.Router();

router.use(protect);

router.get(
  "/hr/employees",
  authorizeAnyPermissions(PERMISSIONS.VIEW_HR_EMPLOYEES, PERMISSIONS.VIEW_EMPLOYEES),
  getEmployees
);

router.get(
  "/hr/attendance",
  authorizePermissions(PERMISSIONS.VIEW_HR_EMPLOYEES),
  getAttendance
);

export default router;
