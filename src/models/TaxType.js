import mongoose from "mongoose";

const taxSlabSchema = new mongoose.Schema({
  minAmount: { type: Number, required: true }, // Minimum salary for this slab
  maxAmount: { type: Number, default: null }, // Maximum salary for this slab (null for unlimited)
  percentage: { type: Number, required: true }, // Tax percentage for this slab
  fixedAmount: { type: Number, default: 0 }, // Fixed amount to add for this slab
});

const taxTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g., "Income Tax", "Professional Tax", "SSF"
    slug: { type: String, required: true, unique: true }, // For API use
    description: { type: String, default: "" },
    category: {
      type: String,
      enum: ["income_tax", "professional_tax", "social_security", "provident_fund", "health_insurance", "other"],
      default: "other"
    },
    calculationType: {
      type: String,
      enum: ["progressive", "percentage", "fixed", "slab"],
      default: "percentage"
    }, // progressive = tax slabs, percentage = % of salary, fixed = fixed amount, slab = single slab
    isActive: { type: Boolean, default: true },
    isMandatory: { type: Boolean, default: false }, // If true, automatically applied to all employees
    defaultPercentage: { type: Number, default: 0 }, // For backward compatibility
    defaultFixedAmount: { type: Number, default: 0 }, // For backward compatibility
    taxSlabs: [taxSlabSchema], // For progressive taxation
    exemptions: [{
      name: { type: String, required: true },
      amount: { type: Number, required: true },
      isActive: { type: Boolean, default: true }
    }],
    deductions: [{
      name: { type: String, required: true },
      percentage: { type: Number, default: 0 },
      fixedAmount: { type: Number, default: 0 },
      isActive: { type: Boolean, default: true }
    }],
    frequency: {
      type: String,
      enum: ["monthly", "quarterly", "half_yearly", "yearly"],
      default: "monthly"
    },
    applicableTo: {
      type: String,
      enum: ["all", "above_threshold", "below_threshold", "specific_roles"],
      default: "all"
    },
    thresholdAmount: { type: Number, default: 0 }, // For threshold-based application
    applicableRoles: [{ type: String }], // Role names this tax applies to
    priority: { type: Number, default: 0 }, // Calculation priority (lower numbers calculated first)
  },
  { timestamps: true },
);

// Index for efficient queries
taxTypeSchema.index({ category: 1, isActive: 1 });
taxTypeSchema.index({ calculationType: 1 });
taxTypeSchema.index({ priority: 1 });

const TaxType = mongoose.model("TaxType", taxTypeSchema);
export default TaxType;
