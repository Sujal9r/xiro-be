import User from "../models/User.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";
import { resolveUserPermissions } from "../utils/permissions.js";
import Role from "../models/Role.js";
import AttendanceLog from "../models/AttendanceLog.js";
import { autoClockOutIfNeeded } from "../utils/attendance.js";

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
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpire = Date.now() + 15 * 60 * 1000;
    await user.save();

    const resetURL = `http://localhost:3000/reset-password/${resetToken}`;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset Request",
      text: `Click here to reset your password: ${resetURL}`,
    });

    res.json({ message: "Password reset link sent to email" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// RESET PASSWORD (using reset token from email)
export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;
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
