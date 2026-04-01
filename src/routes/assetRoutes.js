import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { authorizePermissions } from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";
import {
  assignAsset,
  createAsset,
  deleteAsset,
  getAssetMeta,
  listAssets,
  updateAsset,
  updateAssetCondition,
} from "../controllers/assetController.js";

const router = express.Router();

router.use(protect);

router.get(
  "/admin/assets/meta",
  authorizePermissions(PERMISSIONS.ASSET_PANEL_VIEW),
  getAssetMeta,
);

router.get(
  "/admin/assets",
  authorizePermissions(PERMISSIONS.ASSET_PANEL_VIEW),
  listAssets,
);

router.post(
  "/admin/assets",
  authorizePermissions(PERMISSIONS.ASSET_CREATE),
  createAsset,
);

router.put(
  "/admin/assets/:id",
  authorizePermissions(PERMISSIONS.ASSET_EDIT),
  updateAsset,
);

router.patch(
  "/admin/assets/:id/condition",
  authorizePermissions(PERMISSIONS.ASSET_CONDITION_UPDATE),
  updateAssetCondition,
);

router.patch(
  "/admin/assets/:id/assign",
  authorizePermissions(PERMISSIONS.ASSET_ASSIGN),
  assignAsset,
);

router.delete(
  "/admin/assets/:id",
  authorizePermissions(PERMISSIONS.ASSET_DELETE),
  deleteAsset,
);

export default router;
