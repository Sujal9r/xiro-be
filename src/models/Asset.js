import mongoose from "mongoose";

export const ASSET_CONDITIONS = ["excellent", "good", "needs_attention"];
export const ASSET_STATUSES = ["available", "assigned", "maintenance", "retired"];
export const ASSIGNMENT_TYPES = ["user", "external"];

const assignmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [...ASSIGNMENT_TYPES, ""],
      default: "",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const assetSchema = new mongoose.Schema(
  {
    assetCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    serialNumber: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    purchaseDate: {
      type: Date,
      default: null,
    },
    purchaseCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    photo: {
      type: String,
      default: "",
    },
    condition: {
      type: String,
      enum: ASSET_CONDITIONS,
      default: "good",
    },
    status: {
      type: String,
      enum: ASSET_STATUSES,
      default: "available",
    },
    assignment: {
      type: assignmentSchema,
      default: () => ({
        type: "",
        user: null,
        name: "",
        email: "",
        assignedAt: null,
        notes: "",
      }),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    history: {
      type: [historySchema],
      default: [],
    },
  },
  { timestamps: true },
);

const Asset = mongoose.model("Asset", assetSchema);
export default Asset;
