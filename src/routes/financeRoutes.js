import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { authorizePermissions } from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";
import {
  createExpense,
  getPayroll,
  getMyFinance,
  listExpenses,
  updateSalary,
} from "../controllers/financeController.js";

const router = express.Router();

router.get(
  "/finance/payroll",
  protect,
  authorizePermissions(PERMISSIONS.VIEW_ADMIN_FINANCE),
  getPayroll,
);

router.put(
  "/finance/payroll/:id/salary",
  protect,
  authorizePermissions(PERMISSIONS.VIEW_ADMIN_FINANCE),
  updateSalary,
);

router.get(
  "/finance/expenses",
  protect,
  authorizePermissions(PERMISSIONS.VIEW_ADMIN_FINANCE),
  listExpenses,
);

router.post(
  "/finance/expenses",
  protect,
  authorizePermissions(PERMISSIONS.MANAGE_EXPENSES),
  createExpense,
);

router.get(
  "/finance/my",
  protect,
  authorizePermissions(PERMISSIONS.VIEW_USER_FINANCE),
  getMyFinance,
);

export default router;
