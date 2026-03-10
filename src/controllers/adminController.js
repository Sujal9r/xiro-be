import User from "../models/User.js";
import Ticket from "../models/Ticket.js";
import Role from "../models/Role.js";
import AttendanceLog from "../models/AttendanceLog.js";
import LeaveRequest from "../models/LeaveRequest.js";

const SHIFT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeShiftTime = (value = "") => value.toString().trim();

const validateShiftTime = (value = "") => SHIFT_TIME_PATTERN.test(normalizeShiftTime(value));

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("customRole", "name key permissions")
      .sort({ createdAt: -1 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endToday = new Date(today);
    endToday.setHours(23, 59, 59, 999);

    const leaves = await LeaveRequest.find({
      status: "approved",
      fromDate: { $lte: endToday },
      toDate: { $gte: today },
      employee: { $in: users.map((u) => u._id) },
    }).select(
      "employee typeName halfDay leaveUnit halfDaySession partialMinutes partialDayPosition fromDate toDate",
    );

    const leaveMap = leaves.reduce((acc, leave) => {
      acc[leave.employee.toString()] = {
        typeName: leave.typeName,
        halfDay: !!leave.halfDay,
        leaveUnit: leave.leaveUnit || (leave.halfDay ? "half_day" : "full_day"),
        halfDaySession: leave.halfDaySession || "",
        partialMinutes: leave.partialMinutes || 0,
        partialDayPosition: leave.partialDayPosition || "",
        fromDate: leave.fromDate,
        toDate: leave.toDate,
      };
      return acc;
    }, {});

    res.json(
      users.map((user) => ({
        ...user.toObject(),
        leave: leaveMap[user._id.toString()] || null,
      })),
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// Get single user
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("customRole", "name key permissions");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// Create user/admin
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role, customRoleId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const userRole = role || "custom";
    if (!customRoleId) {
      return res.status(400).json({ message: "Role is required" });
    }
    const roleExists = await Role.findById(customRoleId).select("_id");
    if (!roleExists) {
      return res.status(400).json({ message: "Role not found" });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: userRole,
      customRole: customRoleId,
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customRole: user.customRole,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create user" });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { name, email, role, isActive, customRoleId } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (role !== undefined || customRoleId !== undefined) {
      if (!customRoleId) {
        return res.status(400).json({ message: "Role is required" });
      }
      const roleExists = await Role.findById(customRoleId).select("_id");
      if (!roleExists) {
        return res.status(400).json({ message: "Role not found" });
      }
      user.role = role || "custom";
      user.customRole = customRoleId;
    }
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    res.json({
      message: "User updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customRole: user.customRole,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user" });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Don't allow deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user" });
  }
};

// Get admin dashboard stats
export const getAdminDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTickets = await Ticket.countDocuments();
    const pendingTickets = await Ticket.countDocuments({ status: "pending" });
    const startedTickets = await Ticket.countDocuments({ status: "started" });
    const completedTickets = await Ticket.countDocuments({ status: "completed" });

    // Get all users with their attendance
    const users = await User.find()
      .select("name email role isActive")
      .sort({ createdAt: -1 });

    // Get all tickets with details
    const tickets = await Ticket.find()
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      stats: {
        totalUsers,
        totalTickets,
        pendingTickets,
        startedTickets,
        completedTickets,
      },
      users,
      recentTickets: tickets,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard data" });
  }
};

// Get user attendance logs
export const getUserAttendance = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("name email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const attendanceLogs = await AttendanceLog.find({ user: user._id }).sort({
      checkIn: -1,
    });
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      attendanceLogs,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch attendance" });
  }
};

// Get all users attendance
export const getAllUsersAttendance = async (req, res) => {
  try {
    const users = await User.find()
      .select("name email role createdAt employeeId")
      .sort({ createdAt: -1 });
    const logsByUser = await AttendanceLog.find({
      user: { $in: users.map((u) => u._id) },
    }).sort({ checkIn: -1 });
    const logsMap = logsByUser.reduce((acc, log) => {
      const key = log.user.toString();
      acc[key] = acc[key] || [];
      acc[key].push(log);
      return acc;
    }, {});
    res.json(
      users.map((user) => ({
        ...user.toObject(),
        attendanceLogs: logsMap[user._id.toString()] || [],
      })),
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch attendance" });
  }
};

// Get all users with shift assignments
export const getUserShifts = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "superadmin" } })
      .select("name email role customRole employeeId isActive shift")
      .populate("customRole", "name key")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user shifts" });
  }
};

// Update shift for one user
export const updateUserShift = async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    if (!validateShiftTime(startTime) || !validateShiftTime(endTime)) {
      return res
        .status(400)
        .json({ message: "Invalid shift time. Use 24-hour HH:mm format." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role === "superadmin") {
      return res.status(400).json({ message: "Cannot update shift for superadmin" });
    }

    user.shift = {
      startTime: normalizeShiftTime(startTime),
      endTime: normalizeShiftTime(endTime),
    };
    await user.save();

    res.json({
      message: "Shift updated successfully",
      user: {
        id: user._id,
        name: user.name,
        shift: user.shift,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update shift" });
  }
};
