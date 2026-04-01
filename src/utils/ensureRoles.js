import Role from "../models/Role.js";
import { ALL_PERMISSIONS, PERMISSIONS } from "./roles.js";

const USER_ROLE_KEY = "user";
const USER_ROLE_NAME = "User";
const SUPERADMIN_ROLE_KEY = "superadmin";
const SUPERADMIN_ROLE_NAME = "Super Admin";
const USER_BASE_PERMISSIONS = [
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.VIEW_MY_WORKSPACE,
  PERMISSIONS.VIEW_USER_TASKS,
  PERMISSIONS.ATTENDANCE_CLOCK,
  PERMISSIONS.VIEW_USER_FINANCE,
  PERMISSIONS.LEAVE_APPLY,
  PERMISSIONS.LEAVE_VIEW_MY,
  PERMISSIONS.LEAVE_CANCEL_MY,
  PERMISSIONS.LEAVE_VIEW_BALANCE,
  PERMISSIONS.LEAVE_CALENDAR_VIEW,
  PERMISSIONS.LEAVE_POLICY_VIEW,
  PERMISSIONS.ATTENDANCE_PANEL_VIEW,
  PERMISSIONS.VIEW_SETTINGS,
  PERMISSIONS.ATTENDANCE_REGULARIZATION_REQUEST,
  PERMISSIONS.ASSET_PANEL_VIEW,
];

export const ensureDefaultRoles = async () => {
  const superadminRole = await Role.findOne({ key: SUPERADMIN_ROLE_KEY });

  if (!superadminRole) {
    await Role.create({
      name: SUPERADMIN_ROLE_NAME,
      key: SUPERADMIN_ROLE_KEY,
      slug: SUPERADMIN_ROLE_KEY,
      permissions: ALL_PERMISSIONS,
      isSystem: true,
    });
  } else {
    const currentPermissions = Array.isArray(superadminRole.permissions)
      ? superadminRole.permissions
      : [];
    const mergedPermissions = Array.from(new Set([...currentPermissions, ...ALL_PERMISSIONS]));

    superadminRole.name = SUPERADMIN_ROLE_NAME;
    superadminRole.slug = SUPERADMIN_ROLE_KEY;
    superadminRole.isSystem = true;
    if (mergedPermissions.length !== currentPermissions.length) {
      superadminRole.permissions = mergedPermissions;
    }
    await superadminRole.save();
  }

  const existing = await Role.findOne({ key: USER_ROLE_KEY });

  if (!existing) {
    await Role.create({
      name: USER_ROLE_NAME,
      key: USER_ROLE_KEY,
      slug: USER_ROLE_KEY,
      permissions: USER_BASE_PERMISSIONS,
      isSystem: true,
    });
    return;
  }

  const current = Array.isArray(existing.permissions) ? existing.permissions : [];
  const merged = Array.from(new Set([...current, ...USER_BASE_PERMISSIONS]));
  const shouldUpdate = merged.length !== current.length;

  if (shouldUpdate) {
    existing.permissions = merged;
    if (!existing.slug) {
      existing.slug = existing.key;
    }
    existing.isSystem = true;
    await existing.save();
  }
};
