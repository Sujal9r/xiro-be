import mongoose from "mongoose";

const taxCalculationSchema = new mongoose.Schema({
  slabMin: { type: Number, default: 0 },
  slabMax: { type: Number, default: null },
  taxableAmount: { type: Number, required: true },
  percentage: { type: Number, required: true },
  fixedAmount: { type: Number, default: 0 },
  calculatedAmount: { type: Number, required: true },
});

const taxSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    taxType: { type: String, required: true }, // Tax type name
    taxTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "TaxType" }, // Reference to tax type
    amount: { type: Number, required: true }, // Final calculated amount
    baseSalary: { type: Number, required: true }, // Salary used for calculation
    taxableIncome: { type: Number, required: true }, // Income after exemptions
    month: { type: Number, required: true }, // 1-12
    year: { type: Number, required: true },
    payrollMonth: { type: Date, required: true }, // For easy querying
    calculationType: {
      type: String,
      enum: ["progressive", "percentage", "fixed", "slab"],
      required: true
    },
    calculationBreakdown: [taxCalculationSchema], // Detailed calculation steps
    exemptions: [{
      name: { type: String, required: true },
      amount: { type: Number, required: true },
    }],
    deductions: [{
      name: { type: String, required: true },
      amount: { type: Number, required: true },
    }],
    isAutoCalculated: { type: Boolean, default: false }, // True if automatically calculated
    isManualOverride: { type: Boolean, default: false }, // True if manually adjusted
    originalAmount: { type: Number, default: 0 }, // Original auto-calculated amount before manual override
    remarks: { type: String, default: "" },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["calculated", "pending", "approved", "paid"],
      default: "calculated"
    },
    // Backward compatibility fields
    salary: { type: Number, default: 0 }, // Keep for backward compatibility
    percentage: { type: Number, default: 0 }, // Keep for backward compatibility
  },
  { timestamps: true },
);

// Indexes for efficient queries
taxSchema.index({ user: 1, year: 1, month: 1 });
taxSchema.index({ user: 1, payrollMonth: -1 });
taxSchema.index({ taxType: 1, year: 1, month: 1 });
taxSchema.index({ status: 1 });
taxSchema.index({ isAutoCalculated: 1 });

const Tax = mongoose.model("Tax", taxSchema);
export default Tax;
