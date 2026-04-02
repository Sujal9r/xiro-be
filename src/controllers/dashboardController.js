import User from "../models/User.js";
import Ticket from "../models/Ticket.js";
import AttendanceLog from "../models/AttendanceLog.js";
import LeaveRequest from "../models/LeaveRequest.js";
import RegularizationRequest from "../models/RegularizationRequest.js";
import Asset from "../models/Asset.js";
import { resolveUserPermissions } from "../utils/permissions.js";
import { PERMISSIONS } from "../utils/roles.js";
import { getRegularizationBalanceForUser } from "../utils/regularization.js";

const hasAnyPermission = (permissions, required = []) =>
  required.some((perm) => permissions.includes(perm));

export const getDashboard = async (req, res) => {
  try {
    const permissions = await resolveUserPermissions(req.user);
    if (!permissions.includes(PERMISSIONS.VIEW_DASHBOARD)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const response = {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        createdAt: req.user.createdAt,
        shift: req.user.shift || { startTime: "", endTime: "" },
        wfhBaseLocation: req.user.wfhBaseLocation || {
          latitude: null,
          longitude: null,
          radius: 100,
        },
      },
      permissions,
    };

    const canAdminOverview = permissions.includes(PERMISSIONS.VIEW_ADMIN_OVERVIEW);

    if (canAdminOverview) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);

      const [
        totalUsers,
        activeUsers,
        disabledUsers,
        totalTickets,
        pendingTickets,
        startedTickets,
        completedTickets,
        checkedInUsersToday,
        onLeaveToday,
        pendingLeaveRequests,
        pendingRegularizations,
        totalAssets,
        assignedAssets,
        maintenanceAssets,
      ] = await Promise.all([
          User.countDocuments(),
          User.countDocuments({ isActive: true }),
          User.countDocuments({ isActive: false }),
          Ticket.countDocuments(),
          Ticket.countDocuments({ status: "pending" }),
          Ticket.countDocuments({ status: "started" }),
          Ticket.countDocuments({ status: "completed" }),
          AttendanceLog.distinct("user", {
            date: { $gte: todayStart, $lte: todayEnd },
          }).then((users) => users.length),
          LeaveRequest.countDocuments({
            status: "approved",
            fromDate: { $lte: todayEnd },
            toDate: { $gte: todayStart },
          }),
          LeaveRequest.countDocuments({ status: "pending" }),
          RegularizationRequest.countDocuments({ status: "pending" }),
          Asset.countDocuments(),
          Asset.countDocuments({ status: "assigned" }),
          Asset.countDocuments({ status: "maintenance" }),
        ]);

      const recentTickets = await Ticket.find()
        .populate("assignedTo", "name email")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .limit(10);

      response.admin = {
        stats: {
          totalUsers,
          activeUsers,
          disabledUsers,
          totalTickets,
          pendingTickets,
          startedTickets,
          completedTickets,
          checkedInUsersToday,
          onLeaveToday,
          pendingLeaveRequests,
          pendingRegularizations,
          totalAssets,
          assignedAssets,
          maintenanceAssets,
        },
        recentTickets,
      };
    }

    const canHrOverview = permissions.includes(PERMISSIONS.VIEW_HR_OVERVIEW);
    const canReviewRegularization = permissions.includes(
      PERMISSIONS.ATTENDANCE_REGULARIZATION_REVIEW,
    );
    if (canHrOverview) {
      const employees = await User.find()
        .select("name email role customRole isActive createdAt shift")
        .populate("customRole", "name key")
        .sort({ createdAt: -1 });

      const totalEmployees = employees.length;
      const activeEmployees = employees.filter((emp) => emp.isActive).length;
      const disabledEmployees = totalEmployees - activeEmployees;

      const logsByUser = await AttendanceLog.find({
        user: { $in: employees.map((u) => u._id) },
      }).sort({ checkIn: -1 });

      const logsMap = logsByUser.reduce((acc, log) => {
        const key = log.user.toString();
        acc[key] = acc[key] || [];
        acc[key].push(log);
        return acc;
      }, {});

      const attendanceEmployees = employees.map((employee) => ({
        ...employee.toObject(),
        attendanceLogs: logsMap[employee._id.toString()] || [],
      }));

      response.hr = {
        stats: { totalEmployees, activeEmployees, disabledEmployees },
        attendanceEmployees,
      };
    }

    if (canReviewRegularization) {
      const hrRegularizationRequests = await RegularizationRequest.find()
        .sort({ createdAt: -1 })
        .populate("user", "name email")
        .populate("handledBy", "name email");
      response.hr = response.hr || {
        stats: { totalEmployees: 0, activeEmployees: 0, disabledEmployees: 0 },
        attendanceEmployees: [],
      };
      response.hr.regularizationRequests = hrRegularizationRequests;
    }

    const canUserOverview = permissions.includes(PERMISSIONS.VIEW_MY_WORKSPACE);

    if (canUserOverview) {
      const canRequestRegularization = permissions.includes(
        PERMISSIONS.ATTENDANCE_REGULARIZATION_REQUEST,
      );
      const [tickets, attendanceLogs, approvedLeaves, activeWFHRequests, myRegularizationRequests, regularizationBalance] =
        await Promise.all([
        permissions.includes(PERMISSIONS.VIEW_USER_TASKS)
          ? Ticket.find({ assignedTo: req.user._id })
              .select("title description status assignedTo createdAt updatedAt")
              .sort({ createdAt: -1 })
          : Promise.resolve([]),
        AttendanceLog.find({ user: req.user._id }).sort({ checkIn: -1 }),
        LeaveRequest.find({
          employee: req.user._id,
          status: "approved",
        })
          .select(
            "fromDate toDate totalDays halfDay leaveUnit halfDaySession partialMinutes partialDayPosition typeName typeKey geofenceLocation status",
          )
          .sort({ fromDate: -1 }),
        LeaveRequest.find({
          employee: req.user._id,
          typeKey: "wfh",
          status: { $ne: "cancelled" },
        })
          .select(
            "fromDate toDate totalDays halfDay leaveUnit halfDaySession partialMinutes partialDayPosition typeName typeKey geofenceLocation status",
          )
          .sort({ fromDate: -1, createdAt: -1 }),
        canRequestRegularization
          ? RegularizationRequest.find({ user: req.user._id })
              .sort({ createdAt: -1 })
              .populate("handledBy", "name email")
          : Promise.resolve([]),
        canRequestRegularization
          ? getRegularizationBalanceForUser(req.user._id).then((result) => result.remaining)
          : Promise.resolve(0),
      ]);

      const pending = tickets.filter((t) => t.status === "pending").length;
      const started = tickets.filter((t) => t.status === "started").length;
      const completed = tickets.filter((t) => t.status === "completed").length;

      response.me = {
        stats: {
          total: tickets.length,
          pending,
          started,
          completed,
        },
        tickets,
        attendanceLogs,
        approvedLeaves,
        activeWFHRequests,
        regularizationBalance,
        regularizationRequests: myRegularizationRequests,
      };
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard data" });
  }
};
