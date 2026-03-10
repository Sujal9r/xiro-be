import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    slug: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

roleSchema.pre("validate", function () {
  if (!this.slug && this.key) {
    this.slug = this.key;
  }
});

const Role = mongoose.model("Role", roleSchema);
export default Role;
