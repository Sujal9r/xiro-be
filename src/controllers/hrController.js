import User from "../models/User.js";
import AttendanceLog from "../models/AttendanceLog.js";
import LeaveRequest from "../models/LeaveRequest.js";

export const getEmployees = async (req, res) => {
  try {
    const users = await User.find()
      .select("name email role customRole isActive createdAt")
      .populate("customRole", "name key")
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
    res.status(500).json({ message: "Failed to fetch employees" });
  }
};

export const getAttendance = async (req, res) => {
  try {
    const users = await User.find()
      .select("name email role customRole isActive createdAt")
      .populate("customRole", "name key")
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
