import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    typeKey: { type: String, required: true },
    typeName: { type: String, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    halfDay: { type: Boolean, default: false },
    leaveUnit: {
      type: String,
      enum: ["full_day", "half_day", "partial_day"],
      default: "full_day",
    },
    halfDaySession: {
      type: String,
      enum: ["", "first_half", "second_half"],
      default: "",
    },
    partialMinutes: { type: Number, default: 0, min: 0, max: 60 },
    partialDayPosition: {
      type: String,
      enum: ["", "start", "end"],
      default: "",
    },
    reason: { type: String, default: "" },
    attachmentUrl: { type: String, default: "" },
    totalDays: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    remarks: { type: String, default: "" },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ employee: 1, fromDate: -1 });
leaveRequestSchema.index({ status: 1, fromDate: -1 });

const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);
export default LeaveRequest;
