import mongoose from "mongoose";

const leaveTypeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    yearlyLimit: { type: Number, default: 0 },
    allowCarryForward: { type: Boolean, default: false },
    maxCarryForward: { type: Number, default: 0 },
    allowHalfDay: { type: Boolean, default: true },
    paid: { type: Boolean, default: true },
  },
  { _id: false },
);

const leavePolicySchema = new mongoose.Schema(
  {
    leaveTypes: { type: [leaveTypeSchema], default: [] },
    resetMonth: { type: Number, default: 1 }, // 1-12
    resetDay: { type: Number, default: 1 }, // 1-31
    regularizationBalance: { type: Number, default: 5, min: 0 },
  },
  { timestamps: true },
);

const LeavePolicy = mongoose.model("LeavePolicy", leavePolicySchema);
export default LeavePolicy;
