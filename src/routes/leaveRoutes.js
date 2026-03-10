import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { authorizePermissions } from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";
import {
  applyLeave,
  getMyLeaves,
  cancelMyLeave,
  getLeaveBalance,
  getLeaveRequests,
  approveLeave,
  rejectLeave,
  getLeaveCalendar,
  getLeavePolicy,
  updateLeavePolicy,
  getMonthlyReport,
  getEmployeeSummary,
  exportMonthlyReport,
} from "../controllers/leaveController.js";

const router = express.Router();

router.use(protect);

// Employee
router.post(
  "/leaves/apply",
  authorizePermissions(PERMISSIONS.LEAVE_APPLY),
  applyLeave,
);
router.get(
  "/leaves/my",
  authorizePermissions(PERMISSIONS.LEAVE_VIEW_MY),
  getMyLeaves,
);
router.delete(
  "/leaves/my/:id",
  authorizePermissions(PERMISSIONS.LEAVE_CANCEL_MY),
  cancelMyLeave,
);
router.get(
  "/leaves/balance",
  authorizePermissions(PERMISSIONS.LEAVE_VIEW_BALANCE),
  getLeaveBalance,
);

// Manager/HR
router.get(
  "/leaves/requests",
  authorizePermissions(PERMISSIONS.LEAVE_REQUESTS_VIEW),
  getLeaveRequests,
);
router.put(
  "/leaves/requests/:id/approve",
  authorizePermissions(PERMISSIONS.LEAVE_REQUESTS_APPROVE),
  approveLeave,
);
router.put(
  "/leaves/requests/:id/reject",
  authorizePermissions(PERMISSIONS.LEAVE_REQUESTS_REJECT),
  rejectLeave,
);
router.get(
  "/leaves/calendar",
  authorizePermissions(PERMISSIONS.LEAVE_CALENDAR_VIEW),
  getLeaveCalendar,
);

// Policy
router.get(
  "/leaves/policy",
  authorizePermissions(PERMISSIONS.LEAVE_POLICY_VIEW),
  getLeavePolicy,
);
router.put(
  "/leaves/policy",
  authorizePermissions(PERMISSIONS.LEAVE_POLICY_MANAGE),
  updateLeavePolicy,
);

// Reports
router.get(
  "/leaves/reports/monthly",
  authorizePermissions(PERMISSIONS.LEAVE_REPORTS_VIEW),
  getMonthlyReport,
);
router.get(
  "/leaves/reports/summary",
  authorizePermissions(PERMISSIONS.LEAVE_REPORTS_VIEW),
  getEmployeeSummary,
);
router.get(
  "/leaves/reports/export",
  authorizePermissions(PERMISSIONS.LEAVE_REPORTS_EXPORT),
  exportMonthlyReport,
);

export default router;
