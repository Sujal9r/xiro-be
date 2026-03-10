import mongoose from "mongoose";

const attendanceLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date },
    duration: { type: Number },
    shiftStartTime: { type: String, default: "" },
    shiftEndTime: { type: String, default: "" },
    isLate: { type: Boolean, default: false },
    lateMinutes: { type: Number, default: 0 },
    hasPenalty: { type: Boolean, default: false },
    isEarlyClockOut: { type: Boolean, default: false },
    isRegularized: { type: Boolean, default: false },
    regularizedType: {
      type: String,
      enum: ["", "penalty", "logs"],
      default: "",
    },
    regularizedAt: { type: Date },
    sessions: [
      {
        checkIn: { type: Date, required: true },
        checkOut: { type: Date },
        duration: { type: Number },
        shiftStartTime: { type: String, default: "" },
        shiftEndTime: { type: String, default: "" },
        isLate: { type: Boolean, default: false },
        lateMinutes: { type: Number, default: 0 },
        hasPenalty: { type: Boolean, default: false },
        isEarlyClockOut: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

attendanceLogSchema.index({ user: 1, checkIn: -1 });
attendanceLogSchema.index({ user: 1, checkOut: 1 });
attendanceLogSchema.index({ user: 1, date: -1 });

const AttendanceLog = mongoose.model("AttendanceLog", attendanceLogSchema);

export default AttendanceLog;
