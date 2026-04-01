import Asset, {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  ASSIGNMENT_TYPES,
} from "../models/Asset.js";
import Counter from "../models/Counter.js";
import User from "../models/User.js";
import { PERMISSIONS } from "../utils/roles.js";

const formatAssetCode = async () => {
  const counter = await Counter.findOneAndUpdate(
    { key: "asset" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `AST-${String(counter.seq).padStart(4, "0")}`;
};

const trimText = (value = "") => value.toString().trim();

const normalizeAssignment = async (payload = {}) => {
  const assignTo = payload?.assignTo || {};
  const hasAssignment =
    assignTo &&
    (assignTo.type ||
      assignTo.userId ||
      trimText(assignTo.name) ||
      trimText(assignTo.email) ||
      trimText(assignTo.notes));

  if (!hasAssignment) {
    return {
      type: "",
      user: null,
      name: "",
      email: "",
      assignedAt: null,
      notes: "",
    };
  }

  const type = ASSIGNMENT_TYPES.includes(assignTo.type) ? assignTo.type : null;
  if (!type) {
    throw new Error("Assignment type is invalid");
  }

  if (type === "user") {
    if (!assignTo.userId) {
      throw new Error("Assigned user is required");
    }
    const user = await User.findById(assignTo.userId).select("name email");
    if (!user) {
      throw new Error("Assigned user not found");
    }
    return {
      type: "user",
      user: user._id,
      name: user.name,
      email: user.email,
      assignedAt: new Date(),
      notes: trimText(assignTo.notes),
    };
  }

  const name = trimText(assignTo.name);
  if (!name) {
    throw new Error("Assigned person name is required");
  }

  return {
    type: "external",
    user: null,
    name,
    email: trimText(assignTo.email),
    assignedAt: new Date(),
    notes: trimText(assignTo.notes),
  };
};

const pushHistory = (asset, action, message, actor) => {
  asset.history.unshift({
    action,
    message,
    actor: actor?._id || null,
    createdAt: new Date(),
  });
  if (asset.history.length > 25) {
    asset.history = asset.history.slice(0, 25);
  }
};

const serializeAsset = (assetDoc) => {
  const assignment = assetDoc.assignment || {};
  const assignedUser = assignment.user && typeof assignment.user === "object"
    ? {
        id: assignment.user._id?.toString?.() || assignment.user.id,
        name: assignment.user.name || assignment.name || "",
        email: assignment.user.email || assignment.email || "",
      }
    : null;

  return {
    id: assetDoc._id.toString(),
    assetCode: assetDoc.assetCode,
    name: assetDoc.name,
    category: assetDoc.category,
    serialNumber: assetDoc.serialNumber,
    description: assetDoc.description,
    purchaseDate: assetDoc.purchaseDate,
    purchaseCost: assetDoc.purchaseCost,
    location: assetDoc.location,
    photo: assetDoc.photo,
    condition: assetDoc.condition,
    status: assetDoc.status,
    assignment: {
      type: assignment.type || null,
      assignedUser,
      name: assignment.name || "",
      email: assignment.email || "",
      assignedAt: assignment.assignedAt || null,
      notes: assignment.notes || "",
    },
    createdAt: assetDoc.createdAt,
    updatedAt: assetDoc.updatedAt,
    history: (assetDoc.history || []).map((item) => ({
      action: item.action,
      message: item.message,
      createdAt: item.createdAt,
      actorName: item.actor?.name || "System",
    })),
  };
};

const applyEditableFields = (asset, payload) => {
  asset.name = trimText(payload.name);
  asset.category = trimText(payload.category) || "General";
  asset.serialNumber = trimText(payload.serialNumber);
  asset.description = trimText(payload.description);
  asset.location = trimText(payload.location);
  asset.photo = payload.photo || "";
  asset.purchaseDate = payload.purchaseDate ? new Date(payload.purchaseDate) : null;
  asset.purchaseCost = Number.isFinite(Number(payload.purchaseCost))
    ? Number(payload.purchaseCost)
    : 0;
  asset.status = ASSET_STATUSES.includes(payload.status) ? payload.status : asset.status;
  asset.condition = ASSET_CONDITIONS.includes(payload.condition)
    ? payload.condition
    : asset.condition;
};

export const getAssetMeta = async (req, res) => {
  try {
    const canAssign = req.userPermissions?.includes(PERMISSIONS.ASSET_ASSIGN);
    const users = canAssign
      ? await User.find({ role: { $ne: "superadmin" }, isActive: true })
          .select("name email employeeId")
          .sort({ name: 1 })
      : [];

    res.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
      })),
      conditions: ASSET_CONDITIONS,
      statuses: ASSET_STATUSES,
      assignmentTypes: ASSIGNMENT_TYPES,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load asset metadata" });
  }
};

export const listAssets = async (req, res) => {
  try {
    const canViewAll = req.userPermissions?.includes(PERMISSIONS.ASSET_VIEW_ALL);
    const assets = await Asset.find(
      canViewAll ? {} : { "assignment.user": req.user._id },
    )
      .populate("assignment.user", "name email")
      .populate("history.actor", "name")
      .sort({ updatedAt: -1, createdAt: -1 });

    res.json({ items: assets.map(serializeAsset) });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch assets" });
  }
};

export const createAsset = async (req, res) => {
  try {
    if (!trimText(req.body.name)) {
      return res.status(400).json({ message: "Asset name is required" });
    }

    const assignment = await normalizeAssignment(req.body);
    const asset = await Asset.create({
      assetCode: await formatAssetCode(),
      name: trimText(req.body.name),
      category: trimText(req.body.category) || "General",
      serialNumber: trimText(req.body.serialNumber),
      description: trimText(req.body.description),
      location: trimText(req.body.location),
      purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : null,
      purchaseCost: Number.isFinite(Number(req.body.purchaseCost))
        ? Number(req.body.purchaseCost)
        : 0,
      photo: req.body.photo || "",
      condition: ASSET_CONDITIONS.includes(req.body.condition)
        ? req.body.condition
        : "good",
      status: ASSET_STATUSES.includes(req.body.status)
        ? req.body.status
        : assignment.type
          ? "assigned"
          : "available",
      assignment,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    pushHistory(asset, "created", `Created asset ${asset.name}`, req.user);
    if (assignment.type) {
      pushHistory(asset, "assigned", `Assigned to ${assignment.name}`, req.user);
    }
    await asset.save();

    const populated = await Asset.findById(asset._id)
      .populate("assignment.user", "name email")
      .populate("history.actor", "name");

    res.status(201).json({ asset: serializeAsset(populated) });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to create asset" });
  }
};

export const updateAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    if (!trimText(req.body.name)) {
      return res.status(400).json({ message: "Asset name is required" });
    }

    const previousName = asset.name;
    applyEditableFields(asset, req.body);
    asset.updatedBy = req.user._id;
    pushHistory(asset, "updated", `Updated asset details for ${previousName}`, req.user);
    await asset.save();

    const populated = await Asset.findById(asset._id)
      .populate("assignment.user", "name email")
      .populate("history.actor", "name");

    res.json({ asset: serializeAsset(populated) });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update asset" });
  }
};

export const updateAssetCondition = async (req, res) => {
  try {
    const { condition } = req.body;
    if (!ASSET_CONDITIONS.includes(condition)) {
      return res.status(400).json({ message: "Asset condition is invalid" });
    }

    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    asset.condition = condition;
    asset.updatedBy = req.user._id;
    pushHistory(
      asset,
      "condition",
      `Condition changed to ${condition.replace("_", " ")}`,
      req.user,
    );
    await asset.save();

    const populated = await Asset.findById(asset._id)
      .populate("assignment.user", "name email")
      .populate("history.actor", "name");

    res.json({ asset: serializeAsset(populated) });
  } catch (error) {
    res.status(500).json({ message: "Failed to update asset condition" });
  }
};

export const assignAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    const assignment = await normalizeAssignment(req.body);
    const unassign = Boolean(req.body.unassign);

    if (unassign) {
      asset.assignment = {
        type: "",
        user: null,
        name: "",
        email: "",
        assignedAt: null,
        notes: "",
      };
      asset.status = req.body.status && ASSET_STATUSES.includes(req.body.status)
        ? req.body.status
        : "available";
      pushHistory(asset, "unassigned", "Asset assignment cleared", req.user);
    } else {
      asset.assignment = assignment;
      asset.status = req.body.status && ASSET_STATUSES.includes(req.body.status)
        ? req.body.status
        : "assigned";
      pushHistory(asset, "assigned", `Assigned to ${assignment.name}`, req.user);
    }

    asset.updatedBy = req.user._id;
    await asset.save();

    const populated = await Asset.findById(asset._id)
      .populate("assignment.user", "name email")
      .populate("history.actor", "name");

    res.json({ asset: serializeAsset(populated) });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update assignment" });
  }
};

export const deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    await Asset.findByIdAndDelete(req.params.id);
    res.json({ message: "Asset deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete asset" });
  }
};
