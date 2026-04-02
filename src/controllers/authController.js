import User from "../models/User.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";
import { resolveUserPermissions } from "../utils/permissions.js";
import Role from "../models/Role.js";
import AttendanceLog from "../models/AttendanceLog.js";
import { autoClockOutIfNeeded } from "../utils/attendance.js";

const OTP_VALIDITY_MS = 10 * 60 * 1000;
const RESET_SESSION_VALIDITY_MS = 15 * 60 * 1000;

const normalizeEmail = (value = "") => value.toString().trim().toLowerCase();
const generateOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`;
const hashValue = (value = "") => crypto.createHash("sha256").update(value).digest("hex");
const createResetSessionToken = () => crypto.randomBytes(32).toString("hex");

const getPasswordResetTransporter = () => {
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return "sendgrid";
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error(
      "Password reset email is not configured. Set SENDGRID_API_KEY or EMAIL_USER and EMAIL_PASS."
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
};

const buildOtpEmailHtml = ({ name, otp }) => `
  <div style="margin:0;padding:32px;background:#eef4ff;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dbeafe;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
      <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">
        <div style="font-size:24px;font-weight:700;letter-spacing:0.04em;">Xiro</div>
        <div style="margin-top:10px;font-size:14px;opacity:0.82;">Password reset verification</div>
      </div>
      <div style="padding:32px;">
        <p style="margin:0 0 14px;font-size:16px;">Hi ${name || "there"},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">
          We received a request to reset your Xiro password. Use the verification code below to continue.
        </p>
        <div style="margin:24px 0;padding:18px 20px;border-radius:18px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center;">
          <div style="font-size:13px;color:#1d4ed8;letter-spacing:0.18em;text-transform:uppercase;">One-time password</div>
          <div style="margin-top:10px;font-size:34px;font-weight:700;letter-spacing:0.42em;color:#0f172a;">${otp}</div>
        </div>
        <p style="margin:0 0 10px;font-size:14px;color:#475569;">This code will expire in 10 minutes.</p>
        <p style="margin:0;font-size:14px;color:#475569;">If you did not request this reset, you can safely ignore this email.</p>
      </div>
    </div>
  </div>
`;

// SIGNUP
export const signup = async (req, res) => {
  try {
    const {
      name,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      password,
      role,
      customRoleId,
    } = req.body;

    const derivedName =
      name ||
      [firstName, middleName, lastName]
        .filter((part) => part && part.toString().trim())
        .join(" ")
        .trim();

    if (!derivedName || !email || !password || !phoneNumber)
      return res.status(400).json({ message: "All fields required" });

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "User already exists" });

    const userRole = role || "custom";
    let resolvedRoleId = customRoleId;
    if (!resolvedRoleId) {
      const defaultRole = await Role.findOne({ key: "user" }).select("_id");
      if (defaultRole) {
        resolvedRoleId = defaultRole._id.toString();
      }
    }
    if (!resolvedRoleId) {
      return res.status(400).json({ message: "Role is required" });
    }
    const roleExists = await Role.findById(resolvedRoleId).select("_id");
    if (!roleExists) {
      return res.status(400).json({ message: "Role not found" });
    }
    const user = await User.create({
      name: derivedName,
      firstName: firstName || "",
      middleName: middleName || "",
      lastName: lastName || "",
      phoneNumber: phoneNumber || "",
      email,
      password,
      role: userRole,
      customRole: resolvedRoleId,
    });

    res.status(201).json({
      message: "Signup successful",
      user: {
        id: user._id,
        name: user.name,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// LOGIN
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Email is incorrect." });
    }

    if (!(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Password is incorrect." });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    const permissions = await resolveUserPermissions(user);

    res.json({
      message: "Login successful",
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customRole: user.customRole,
        permissions,
        avatar: user.avatar,
        bio: user.bio,
      },
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// FORGOT PASSWORD
export const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found for this email" });
    }

    const otp = generateOtp();
    user.passwordResetOtpHash = hashValue(otp);
    user.passwordResetOtpExpire = new Date(Date.now() + OTP_VALIDITY_MS);
    user.passwordResetSessionHash = "";
    user.passwordResetSessionExpire = null;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;
    await user.save();

    const transporter = getPasswordResetTransporter();

    if (transporter === "sendgrid") {
      await sgMail.send({
        from: process.env.EMAIL_FROM || "noreply@xiro.com",
        to: user.email,
        subject: "Xiro password reset OTP",
        text: `Your Xiro password reset OTP is ${otp}. It will expire in 10 minutes.`,
        html: buildOtpEmailHtml({ name: user.firstName || user.name, otp }),
      });
    } else {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Xiro password reset OTP",
        text: `Your Xiro password reset OTP is ${otp}. It will expire in 10 minutes.`,
        html: buildOtpEmailHtml({ name: user.firstName || user.name, otp }),
      });
    }

    res.json({
      message: "We sent a 6-digit OTP to your email. Enter it to continue.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Unable to send OTP. Please try again later." });
  }
};

export const verifyPasswordResetOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp?.toString().trim() || "";

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found for this email" });
    }

    const isOtpExpired =
      !user.passwordResetOtpExpire || user.passwordResetOtpExpire.getTime() < Date.now();
    const isOtpValid =
      !!user.passwordResetOtpHash && user.passwordResetOtpHash === hashValue(otp);

    if (!isOtpValid || isOtpExpired) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const resetSessionToken = createResetSessionToken();
    user.passwordResetSessionHash = hashValue(resetSessionToken);
    user.passwordResetSessionExpire = new Date(Date.now() + RESET_SESSION_VALIDITY_MS);
    user.passwordResetOtpHash = "";
    user.passwordResetOtpExpire = null;
    await user.save();

    res.json({
      message: "OTP verified. You can now set a new password.",
      resetSessionToken,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const resetSessionToken = req.body.resetSessionToken?.toString().trim() || "";
    const password = req.body.password?.toString() || "";

    if (!email || !resetSessionToken || !password) {
      return res.status(400).json({ message: "Missing data" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid reset request" });
    }

    const isSessionExpired =
      !user.passwordResetSessionExpire ||
      user.passwordResetSessionExpire.getTime() < Date.now();
    const isSessionValid =
      !!user.passwordResetSessionHash &&
      user.passwordResetSessionHash === hashValue(resetSessionToken);

    if (!isSessionValid || isSessionExpired) {
      return res.status(400).json({ message: "Your reset session has expired. Request a new OTP." });
    }

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;
    user.passwordResetOtpHash = "";
    user.passwordResetOtpExpire = null;
    user.passwordResetSessionHash = "";
    user.passwordResetSessionExpire = null;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE PASSWORD (for logged-in users)
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "All fields required" });
    }

    const user = await User.findById(req.user._id);
    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// LOGOUT
export const logout = async (req, res) => {
  try {
    res.json({ 
      message: "Logout successful",
      success: true 
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// GET PROFILE
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("customRole", "name key permissions");
    const lastOpen = await AttendanceLog.findOne({
      user: user._id,
      checkOut: { $exists: false },
    }).sort({ checkIn: -1 });
    if (lastOpen) {
      const autoClosed = await autoClockOutIfNeeded(lastOpen);
      if (autoClosed) {
        await lastOpen.save();
      }
    }
    const attendanceLogs = await AttendanceLog.find({ user: user._id }).sort({
      checkIn: -1,
    });
    const permissions = await resolveUserPermissions(user);
    res.json({ ...user.toObject(), permissions, attendanceLogs });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE PROFILE
export const updateProfile = async (req, res) => {
  try {
    const { name, firstName, middleName, lastName, phoneNumber, bio, avatar } =
      req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (firstName !== undefined) user.firstName = firstName;
    if (middleName !== undefined) user.middleName = middleName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
