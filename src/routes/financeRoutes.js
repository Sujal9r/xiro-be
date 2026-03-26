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
  getTaxTypes,
  createTaxType,
  updateTaxType,
  addTax,
  getTaxesByUser,
  updateTax,
  deleteTax,
  bulkApplyTaxes,
  autoCalculateTaxes,
  getMonthlyPayroll,
  getAnnualPayroll,
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

// ===== TAX MANAGEMENT ROUTES =====
router.get(
  "/finance/tax-types",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_VIEW),
  getTaxTypes,
);

router.post(
  "/finance/tax-types",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_TYPE_MANAGE),
  createTaxType,
);

router.put(
  "/finance/tax-types/:id",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_TYPE_MANAGE),
  updateTaxType,
);

router.get(
  "/finance/taxes",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_VIEW),
  getTaxesByUser,
);

router.post(
  "/finance/taxes",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_ADD),
  addTax,
);

router.put(
  "/finance/taxes/:id",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_EDIT),
  updateTax,
);

router.delete(
  "/finance/taxes/:id",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_DELETE),
  deleteTax,
);

router.post(
  "/finance/taxes/bulk",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_ADD),
  bulkApplyTaxes,
);

router.post(
  "/finance/taxes/auto-calculate",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_TAX_ADD),
  autoCalculateTaxes,
);

// ===== PAYROLL REPORTS ROUTES =====
router.get(
  "/finance/payroll/monthly",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_PAYROLL_VIEW_MONTHLY),
  getMonthlyPayroll,
);

router.get(
  "/finance/payroll/annual",
  protect,
  authorizePermissions(PERMISSIONS.FINANCE_PAYROLL_VIEW_ANNUAL),
  getAnnualPayroll,
);

export default router;
