import mongoose from "mongoose";

const officeBranchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: "", trim: true },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    radiusMeters: { type: Number, required: true, min: 10, max: 50000 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

officeBranchSchema.index({ name: 1 });
officeBranchSchema.index({ code: 1 });
officeBranchSchema.index({ isActive: 1 });

const OfficeBranch = mongoose.model("OfficeBranch", officeBranchSchema);

export default OfficeBranch;
