import mongoose from "mongoose";

const salaryHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    previousSalary: { type: Number, required: true },
    newSalary: { type: Number, required: true },
    effectiveDate: { type: Date, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const SalaryHistory = mongoose.model("SalaryHistory", salaryHistorySchema);
export default SalaryHistory;
