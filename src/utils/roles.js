export const PERMISSIONS = {
  VIEW_DASHBOARD: "view.dashboard",
  VIEW_ADMIN_OVERVIEW: "view.dashboard.admin_overview",
  VIEW_HR_OVERVIEW: "view.dashboard.hr_overview",
  VIEW_MY_WORKSPACE: "view.dashboard.my_workspace",
  VIEW_SETTINGS: "view.settings",
  ATTENDANCE_PANEL_VIEW: "attendance.panel.view",
  ATTENDANCE_VIEW_CLOCKS: "attendance.view.clocks",
  ATTENDANCE_VIEW_PERCENT: "attendance.view.percent",
  ATTENDANCE_VIEW_NOTES: "attendance.view.notes",
  LEAVE_APPLY: "leave.apply",
  LEAVE_VIEW_MY: "leave.view.my",
  LEAVE_CANCEL_MY: "leave.cancel.my",
  LEAVE_VIEW_BALANCE: "leave.view.balance",
  LEAVE_REQUESTS_VIEW: "leave.requests.view",
  LEAVE_REQUESTS_APPROVE: "leave.requests.approve",
  LEAVE_REQUESTS_REJECT: "leave.requests.reject",
  LEAVE_CALENDAR_VIEW: "leave.calendar.view",
  LEAVE_POLICY_VIEW: "leave.policy.view",
  LEAVE_POLICY_MANAGE: "leave.policy.manage",
  LEAVE_REPORTS_VIEW: "leave.reports.view",
  LEAVE_REPORTS_EXPORT: "leave.reports.export",
  LEAVE_PENALTY_WAIVER: "leave.penalty.waiver",
  VIEW_EMPLOYEES: "view.employees",
  VIEW_EMPLOYEE_STATUS: "view.employees.status",
  CREATE_EMPLOYEE: "create.employees",
  EDIT_EMPLOYEE: "edit.employees",
  DELETE_EMPLOYEE: "delete.employees",
  TOGGLE_EMPLOYEE_STATUS: "toggle.employees.status",
  VIEW_ADMIN_USERS: "view.admin.users",
  VIEW_ADMIN_TICKETS: "view.admin.tickets",
  VIEW_ADMIN_ATTENDANCE: "view.admin.attendance",
  VIEW_ADMIN_ROLES: "view.admin.roles",
  VIEW_ADMIN_FINANCE: "view.admin.finance",
  VIEW_SHIFT_MANAGEMENT: "view.shift.management",
  VIEW_USER_FINANCE: "view.user.finance",
  MANAGE_USERS: "manage.users",
  MANAGE_ROLES: "manage.roles",
  MANAGE_TICKETS: "manage.tickets",
  MANAGE_EXPENSES: "manage.expenses",
  MANAGE_SHIFT_MANAGEMENT: "manage.shift.management",
  VIEW_HR_EMPLOYEES: "view.hr.employees",
  VIEW_USER_TASKS: "view.user.tasks",
  ATTENDANCE_CLOCK: "attendance.clock",
  ATTENDANCE_REGULARIZATION_REQUEST: "attendance.regularization.request",
  ATTENDANCE_REGULARIZATION_REVIEW: "attendance.regularization.review",
  // Tax Management Permissions
  FINANCE_TAX_VIEW: "finance.tax.view",
  FINANCE_TAX_ADD: "finance.tax.add",
  FINANCE_TAX_EDIT: "finance.tax.edit",
  FINANCE_TAX_DELETE: "finance.tax.delete",
  FINANCE_TAX_TYPE_MANAGE: "finance.tax.type.manage",
  FINANCE_PAYROLL_VIEW_MONTHLY: "finance.payroll.view.monthly",
  FINANCE_PAYROLL_VIEW_ANNUAL: "finance.payroll.view.annual",
  FINANCE_PAYROLL_EDIT: "finance.payroll.edit",
  FINANCE_PAYSLIP_GENERATE: "finance.payslip.generate",
  ASSET_PANEL_VIEW: "asset.panel.view",
  ASSET_VIEW_ALL: "asset.view.all",
  ASSET_VIEW_SUMMARY: "asset.view.summary",
  ASSET_CREATE: "asset.create",
  ASSET_EDIT: "asset.edit",
  ASSET_ASSIGN: "asset.assign",
  ASSET_CONDITION_UPDATE: "asset.condition.update",
  ASSET_DELETE: "asset.delete",
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const normalizeRoleKey = (value) => {
  if (!value) return "";
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

export const roleKeyFromName = (name) => normalizeRoleKey(name);

export const expandPermissions = (permissions = []) => {
  if (permissions.includes("*")) return ALL_PERMISSIONS;
  return permissions;
};
