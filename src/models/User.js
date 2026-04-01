import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { generateEmployeeId } from "../utils/employeeId.js";
 

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    firstName: { type: String, default: "" },
    middleName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: { type: String, default: "" },
    role: {
      type: String,
      default: "custom",
    },
    customRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      default: null,
    },
    permissions: {
      type: [String],
      default: [],
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    employeeId: {
      type: String,
      default: "",
      trim: true,
      unique: true,
      sparse: true,
    },
    salary: {
      type: Number,
      default: 0,
    },
    taxRate: {
      type: Number,
      default: 0.1,
    },
    benefits: {
      type: Number,
      default: 0,
    },
    deductions: {
      type: Number,
      default: 0,
    },
    reimbursement: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      default: "Direct deposit",
    },
    shift: {
      startTime: {
        type: String,
        default: "",
        trim: true,
      },
      endTime: {
        type: String,
        default: "",
        trim: true,
      },
    },
    wfhBaseLocation: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      radius: { type: Number, default: 100 },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    resetToken: String,
    resetTokenExpire: Date,
    passwordResetOtpHash: {
      type: String,
      default: "",
    },
    passwordResetOtpExpire: {
      type: Date,
      default: null,
    },
    passwordResetSessionHash: {
      type: String,
      default: "",
    },
    passwordResetSessionExpire: {
      type: Date,
      default: null,
    },
    attendanceLogs: [
      {
        checkIn: { type: Date, required: true },
        checkOut: { type: Date },
        duration: { type: Number }, // in minutes
      },
    ],
  },
  { timestamps: true },
);

// hash password before save
userSchema.pre("save", async function () {
  if (!this.employeeId) {
    this.employeeId = await generateEmployeeId();
  }
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// compare entered password with hash
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
