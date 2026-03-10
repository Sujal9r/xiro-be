import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  authorizePermissions,
  authorizeAnyPermissions,
} from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";
import {
  clockIn,
  clockOut,
  createRegularizationRequest,
  getAllRegularizationRequests,
  getAttendancePanel,
  getGeofenceConfig,
  getMyRegularizationRequests,
  reviewRegularizationRequest,
} from "../controllers/attendanceController.js";

const router = express.Router();

router.post(
  "/attendance/clock-in",
  protect,
  authorizePermissions(PERMISSIONS.ATTENDANCE_CLOCK),
  clockIn
);

router.post(
  "/attendance/clock-out",
  protect,
  authorizePermissions(PERMISSIONS.ATTENDANCE_CLOCK),
  clockOut
);

router.get(
  "/attendance/geofence",
  protect,
  authorizePermissions(PERMISSIONS.ATTENDANCE_CLOCK),
  getGeofenceConfig
);

router.get(
  "/attendance/panel",
  protect,
  authorizeAnyPermissions(
    PERMISSIONS.ATTENDANCE_PANEL_VIEW,
    PERMISSIONS.VIEW_ADMIN_ATTENDANCE,
  ),
  getAttendancePanel
);

router.post(
  "/attendance/regularization/request",
  protect,
  authorizePermissions(PERMISSIONS.ATTENDANCE_REGULARIZATION_REQUEST),
  createRegularizationRequest,
);

router.get(
  "/attendance/regularization/my-requests",
  protect,
  authorizePermissions(PERMISSIONS.ATTENDANCE_REGULARIZATION_REQUEST),
  getMyRegularizationRequests,
);

router.get(
  "/attendance/regularization/requests",
  protect,
  authorizePermissions(PERMISSIONS.ATTENDANCE_REGULARIZATION_REVIEW),
  getAllRegularizationRequests,
);

router.post(
  "/attendance/regularization/:id/review",
  protect,
  authorizePermissions(PERMISSIONS.ATTENDANCE_REGULARIZATION_REVIEW),
  reviewRegularizationRequest,
);

export default router;
