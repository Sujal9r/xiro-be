import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  authorizePermissions,
  authorizeAnyPermissions,
} from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";

import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserAttendance,
  getAllUsersAttendance,
  getUserShifts,
  updateUserShift,
} from "../controllers/adminController.js";
import {
  updateGeofenceConfig,
  createOfficeBranch,
  updateOfficeBranch,
  deleteOfficeBranch,
  getGeofenceConfig,
} from "../controllers/attendanceController.js";

const router = express.Router();

router.use(protect);

// User management
router.get(
  "/users",
  authorizeAnyPermissions(PERMISSIONS.VIEW_ADMIN_USERS, PERMISSIONS.VIEW_EMPLOYEES),
  getAllUsers
);
router.get(
  "/users/:id",
  authorizeAnyPermissions(PERMISSIONS.VIEW_ADMIN_USERS, PERMISSIONS.VIEW_EMPLOYEES),
  getUserById
);
router.post(
  "/users",
  authorizeAnyPermissions(PERMISSIONS.MANAGE_USERS, PERMISSIONS.CREATE_EMPLOYEE),
  createUser
);
router.put(
  "/users/:id",
  authorizeAnyPermissions(
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.EDIT_EMPLOYEE,
    PERMISSIONS.TOGGLE_EMPLOYEE_STATUS,
  ),
  updateUser
);
router.delete(
  "/users/:id",
  authorizeAnyPermissions(PERMISSIONS.MANAGE_USERS, PERMISSIONS.DELETE_EMPLOYEE),
  deleteUser
);

// Attendance
router.get(
  "/attendance",
  authorizePermissions(PERMISSIONS.VIEW_ADMIN_ATTENDANCE),
  getAllUsersAttendance
);
router.get(
  "/attendance/:id",
  authorizePermissions(PERMISSIONS.VIEW_ADMIN_ATTENDANCE),
  getUserAttendance
);

// Shift management
router.get(
  "/shifts",
  authorizeAnyPermissions(
    PERMISSIONS.VIEW_SHIFT_MANAGEMENT,
    PERMISSIONS.MANAGE_SHIFT_MANAGEMENT,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.EDIT_EMPLOYEE,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.VIEW_ADMIN_USERS,
  ),
  getUserShifts
);
router.put(
  "/shifts/:id",
  authorizeAnyPermissions(
    PERMISSIONS.MANAGE_SHIFT_MANAGEMENT,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.EDIT_EMPLOYEE,
  ),
  updateUserShift
);

// Geofence & office branches
router.get(
  "/geofence",
  authorizeAnyPermissions(
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.EDIT_EMPLOYEE,
  ),
  getGeofenceConfig
);
router.put(
  "/geofence",
  authorizeAnyPermissions(PERMISSIONS.MANAGE_USERS, PERMISSIONS.EDIT_EMPLOYEE),
  updateGeofenceConfig
);
router.post(
  "/branches",
  authorizeAnyPermissions(PERMISSIONS.MANAGE_USERS, PERMISSIONS.EDIT_EMPLOYEE),
  createOfficeBranch
);
router.put(
  "/branches/:id",
  authorizeAnyPermissions(PERMISSIONS.MANAGE_USERS, PERMISSIONS.EDIT_EMPLOYEE),
  updateOfficeBranch
);
router.delete(
  "/branches/:id",
  authorizeAnyPermissions(PERMISSIONS.MANAGE_USERS, PERMISSIONS.EDIT_EMPLOYEE),
  deleteOfficeBranch
);

export default router;
