import mongoose from "mongoose";

const regularizationRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    attendanceLog: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceLog", default: null },
    type: {
      type: String,
      enum: ["penalty", "logs"],
      required: true,
    },
    date: { type: Date, required: true },
    requestedCheckIn: { type: Date, default: null },
    requestedCheckOut: { type: Date, default: null },
    reason: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    actionNote: { type: String, default: "", trim: true },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

regularizationRequestSchema.index({ user: 1, createdAt: -1 });
regularizationRequestSchema.index({ status: 1, createdAt: -1 });
regularizationRequestSchema.index({ attendanceLog: 1, createdAt: -1 });

const RegularizationRequest = mongoose.model(
  "RegularizationRequest",
  regularizationRequestSchema,
);

export default RegularizationRequest;
