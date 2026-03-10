import LeavePolicy from "../models/LeavePolicy.js";
import LeaveRequest from "../models/LeaveRequest.js";
import User from "../models/User.js";

const LEAVE_UNITS = {
  FULL_DAY: "full_day",
  HALF_DAY: "half_day",
  PARTIAL_DAY: "partial_day",
};
const HALF_DAY_SESSIONS = new Set(["first_half", "second_half"]);
const PARTIAL_DAY_POSITIONS = new Set(["start", "end"]);
const STANDARD_WORKDAY_MINUTES = 8 * 60;

const DEFAULT_LEAVE_TYPES = [
  { key: "sick", name: "Sick Leave", yearlyLimit: 10, allowHalfDay: true, paid: true },
  { key: "casual", name: "Casual Leave", yearlyLimit: 10, allowHalfDay: true, paid: true },
  { key: "paid", name: "Paid Leave", yearlyLimit: 12, allowHalfDay: true, paid: true },
  { key: "unpaid", name: "Unpaid Leave", yearlyLimit: 0, allowHalfDay: true, paid: false },
  { key: "wfh", name: "Work From Home", yearlyLimit: 12, allowHalfDay: true, paid: true },
];

const ensurePolicy = async () => {
  let policy = await LeavePolicy.findOne();
  if (!policy) {
    policy = await LeavePolicy.create({
      leaveTypes: DEFAULT_LEAVE_TYPES,
      resetMonth: 1,
      resetDay: 1,
      regularizationBalance: 5,
    });
  }
  return policy;
};

const getPeriodStart = (policy, referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const start = new Date(year, policy.resetMonth - 1, policy.resetDay);
  if (referenceDate < start) {
    start.setFullYear(year - 1);
  }
  start.setHours(0, 0, 0, 0);
  return start;
};

const dayDiffInclusive = (fromDate, toDate) => {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return diff + 1;
};

const calculateTotalDays = ({ fromDate, toDate, leaveUnit, partialMinutes }) => {
  const days = dayDiffInclusive(fromDate, toDate);
  if (leaveUnit === LEAVE_UNITS.HALF_DAY) {
    return 0.5;
  }
  if (leaveUnit === LEAVE_UNITS.PARTIAL_DAY) {
    const minutes = Number.isFinite(Number(partialMinutes)) ? Number(partialMinutes) : 0;
    return Math.max(0, Math.round((minutes / STANDARD_WORKDAY_MINUTES) * 1000) / 1000);
  }
  return Math.max(1, days);
};

const hasWeekendInRange = (fromDate, toDate) => {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day === 0 || day === 6) return true;
  }
  return false;
};

const getUsedDays = async (employeeId, typeKey, periodStart) => {
  const approved = await LeaveRequest.find({
    employee: employeeId,
    typeKey,
    status: "approved",
    fromDate: { $gte: periodStart },
  }).select("totalDays");

  return approved.reduce((sum, req) => sum + (req.totalDays || 0), 0);
};

export const getLeavePolicy = async (req, res) => {
  try {
    const policy = await ensurePolicy();
    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch leave policy" });
  }
};

export const updateLeavePolicy = async (req, res) => {
  try {
    const { leaveTypes, resetMonth, resetDay, regularizationBalance } = req.body;
    const policy = await ensurePolicy();
    if (Array.isArray(leaveTypes)) {
      policy.leaveTypes = leaveTypes.map((type) => ({
        key: type.key,
        name: type.name,
        yearlyLimit: Number(type.yearlyLimit || 0),
        allowCarryForward: !!type.allowCarryForward,
        maxCarryForward: Number(type.maxCarryForward || 0),
        allowHalfDay: type.allowHalfDay !== false,
        paid: type.paid !== false,
      }));
    }
    if (resetMonth) policy.resetMonth = Number(resetMonth);
    if (resetDay) policy.resetDay = Number(resetDay);
    if (regularizationBalance !== undefined) {
      policy.regularizationBalance = Math.max(0, Number(regularizationBalance || 0));
    }
    await policy.save();
    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: "Failed to update leave policy" });
  }
};

export const applyLeave = async (req, res) => {
  try {
    const {
      typeKey,
      fromDate,
      toDate,
      halfDay,
      leaveUnit: leaveUnitInput,
      halfDaySession: halfDaySessionInput,
      partialMinutes: partialMinutesInput,
      partialDayPosition: partialDayPositionInput,
      reason,
      attachmentUrl,
    } = req.body;

    const normalizedFromDate = fromDate ? new Date(fromDate) : null;
    const normalizedToDate = toDate ? new Date(toDate) : normalizedFromDate;
    if (!normalizedFromDate || Number.isNaN(normalizedFromDate.getTime())) {
      return res.status(400).json({ message: "From date is required" });
    }
    if (!normalizedToDate || Number.isNaN(normalizedToDate.getTime())) {
      return res.status(400).json({ message: "Invalid To date" });
    }

    let leaveUnit = (leaveUnitInput || "").toString().trim();
    if (!leaveUnit && halfDay === true) {
      leaveUnit = LEAVE_UNITS.HALF_DAY;
    }
    if (!leaveUnit) {
      leaveUnit = LEAVE_UNITS.FULL_DAY;
    }

    if (!Object.values(LEAVE_UNITS).includes(leaveUnit)) {
      return res.status(400).json({ message: "Invalid leave unit" });
    }

    const normalizedFromDateValue = new Date(normalizedFromDate);
    normalizedFromDateValue.setHours(0, 0, 0, 0);
    const normalizedToDateValue = new Date(normalizedToDate);
    normalizedToDateValue.setHours(0, 0, 0, 0);

    if (normalizedFromDateValue > normalizedToDateValue) {
      return res.status(400).json({ message: "From date cannot be after To date" });
    }

    if (hasWeekendInRange(normalizedFromDateValue, normalizedToDateValue)) {
      return res.status(400).json({
        message: "Saturday and Sunday are off days. Please apply leave for weekdays only.",
      });
    }
    const isPartialDayFreeType = leaveUnit === LEAVE_UNITS.PARTIAL_DAY;
    const policy = isPartialDayFreeType ? null : await ensurePolicy();
    const leaveType = isPartialDayFreeType
      ? null
      : policy.leaveTypes.find((type) => type.key === typeKey);
    if (!isPartialDayFreeType && !leaveType) {
      return res.status(400).json({ message: "Invalid leave type" });
    }

    if (
      leaveUnit !== LEAVE_UNITS.FULL_DAY &&
      normalizedFromDateValue.getTime() !== normalizedToDateValue.getTime()
    ) {
      return res.status(400).json({
        message: "Half day and partial day leaves can only be applied for a single date",
      });
    }

    const halfDaySession =
      leaveUnit === LEAVE_UNITS.HALF_DAY
        ? (halfDaySessionInput || "").toString().trim()
        : "";
    if (leaveUnit === LEAVE_UNITS.HALF_DAY) {
      if (!leaveType.allowHalfDay) {
        return res.status(400).json({ message: "This leave type does not allow half day" });
      }
      if (!HALF_DAY_SESSIONS.has(halfDaySession)) {
        return res
          .status(400)
          .json({ message: "Select half-day session: first half or second half" });
      }
    }

    const partialMinutesRaw = Number(partialMinutesInput);
    const partialMinutes = Number.isFinite(partialMinutesRaw) ? partialMinutesRaw : 0;
    const partialDayPosition =
      leaveUnit === LEAVE_UNITS.PARTIAL_DAY
        ? (partialDayPositionInput || "").toString().trim()
        : "";

    if (leaveUnit === LEAVE_UNITS.PARTIAL_DAY) {
      if (!Number.isInteger(partialMinutes) || partialMinutes < 0 || partialMinutes > 60) {
        return res.status(400).json({ message: "Partial day minutes must be between 0 and 60" });
      }
      if (!PARTIAL_DAY_POSITIONS.has(partialDayPosition)) {
        return res
          .status(400)
          .json({ message: "Select partial day position: shift start or shift end" });
      }
    }

    const totalDays = calculateTotalDays({
      fromDate: normalizedFromDateValue,
      toDate: normalizedToDateValue,
      leaveUnit,
      partialMinutes,
    });
    const periodStart = policy
      ? getPeriodStart(policy, new Date(normalizedFromDateValue))
      : null;

    if (leaveType && leaveType.yearlyLimit > 0) {
      const usedDays = await getUsedDays(req.user._id, typeKey, periodStart);
      if (usedDays + totalDays > leaveType.yearlyLimit) {
        return res.status(400).json({
          message: `Leave balance exceeded. Remaining: ${Math.max(
            0,
            leaveType.yearlyLimit - usedDays,
          )} day(s)`,
        });
      }
    }

    const request = await LeaveRequest.create({
      employee: req.user._id,
      typeKey: isPartialDayFreeType ? "partial_day" : typeKey,
      typeName: isPartialDayFreeType ? "Partial Day" : leaveType.name,
      fromDate: normalizedFromDateValue,
      toDate: normalizedToDateValue,
      halfDay: leaveUnit === LEAVE_UNITS.HALF_DAY,
      leaveUnit,
      halfDaySession,
      partialMinutes: leaveUnit === LEAVE_UNITS.PARTIAL_DAY ? partialMinutes : 0,
      partialDayPosition,
      reason: reason || "",
      attachmentUrl: attachmentUrl || "",
      totalDays,
    });

    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ message: "Failed to apply leave" });
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    const leaves = await LeaveRequest.find({ employee: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch leaves" });
  }
};

export const cancelMyLeave = async (req, res) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      employee: req.user._id,
    });
    if (!request) {
      return res.status(404).json({ message: "Leave request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be cancelled" });
    }
    request.status = "cancelled";
    await request.save();
    res.json({ message: "Leave cancelled" });
  } catch (error) {
    res.status(500).json({ message: "Failed to cancel leave" });
  }
};

export const getLeaveBalance = async (req, res) => {
  try {
    const policy = await ensurePolicy();
    const periodStart = getPeriodStart(policy, new Date());
    const balances = await Promise.all(
      policy.leaveTypes.map(async (type) => {
        const used = await getUsedDays(req.user._id, type.key, periodStart);
        const total = type.yearlyLimit;
        const remaining = total > 0 ? Math.max(0, total - used) : 0;
        return {
          key: type.key,
          name: type.name,
          total,
          used,
          remaining,
        };
      }),
    );

    const history = await LeaveRequest.find({
      employee: req.user._id,
      status: "approved",
      fromDate: { $gte: periodStart },
    }).sort({ fromDate: -1 });

    res.json({ balances, history });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch leave balance" });
  }
};

export const getLeaveRequests = async (req, res) => {
  try {
    const { status, fromDate, toDate, employeeName } = req.query;
    const query = {};
    if (status) query.status = status;
    if (fromDate || toDate) {
      query.fromDate = {};
      if (fromDate) query.fromDate.$gte = new Date(fromDate);
      if (toDate) query.fromDate.$lte = new Date(toDate);
    }

    let employeesFilter = {};
    if (employeeName) {
      employeesFilter = { name: { $regex: employeeName, $options: "i" } };
    }
    const employees = employeeName
      ? await User.find(employeesFilter).select("_id")
      : null;
    if (employees) {
      query.employee = { $in: employees.map((u) => u._id) };
    }

    const requests = await LeaveRequest.find(query)
      .populate("employee", "name email role")
      .populate("decidedBy", "name email")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch leave requests" });
  }
};

export const approveLeave = async (req, res) => {
  try {
    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Leave request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Leave request already processed" });
    }
    request.status = "approved";
    request.remarks = req.body.remarks || "";
    request.decidedBy = req.user._id;
    request.decidedAt = new Date();
    await request.save();
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: "Failed to approve leave" });
  }
};

export const rejectLeave = async (req, res) => {
  try {
    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Leave request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Leave request already processed" });
    }
    request.status = "rejected";
    request.remarks = req.body.remarks || "";
    request.decidedBy = req.user._id;
    request.decidedAt = new Date();
    await request.save();
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: "Failed to reject leave" });
  }
};

export const getLeaveCalendar = async (req, res) => {
  try {
    const { fromDate, toDate, status } = req.query;
    const query = {};
    if (status) {
      query.status = status;
    }
    if (fromDate || toDate) {
      query.fromDate = {};
      if (fromDate) query.fromDate.$gte = new Date(fromDate);
      if (toDate) query.fromDate.$lte = new Date(toDate);
    }
    const requests = await LeaveRequest.find(query)
      .populate("employee", "name email")
      .sort({ fromDate: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch leave calendar" });
  }
};

export const getMonthlyReport = async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }
    const [year, monthIndex] = month.split("-").map(Number);
    const start = new Date(year, monthIndex - 1, 1);
    const end = new Date(year, monthIndex, 0, 23, 59, 59, 999);

    const requests = await LeaveRequest.find({
      status: "approved",
      fromDate: { $gte: start, $lte: end },
    }).populate("employee", "name email");

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch report" });
  }
};

export const getEmployeeSummary = async (req, res) => {
  try {
    const { employeeId } = req.query;
    const query = { status: "approved" };
    if (employeeId) query.employee = employeeId;

    const requests = await LeaveRequest.find(query).populate("employee", "name email");
    const summary = requests.reduce((acc, reqItem) => {
      const employeeKey = reqItem.employee?._id?.toString() || "unknown";
      if (!acc[employeeKey]) {
        acc[employeeKey] = {
          employee: reqItem.employee,
          totals: {},
          totalDays: 0,
        };
      }
      acc[employeeKey].totals[reqItem.typeName] =
        (acc[employeeKey].totals[reqItem.typeName] || 0) + (reqItem.totalDays || 0);
      acc[employeeKey].totalDays += reqItem.totalDays || 0;
      return acc;
    }, {});

    res.json(Object.values(summary));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch summary" });
  }
};

export const exportMonthlyReport = async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }
    const [year, monthIndex] = month.split("-").map(Number);
    const start = new Date(year, monthIndex - 1, 1);
    const end = new Date(year, monthIndex, 0, 23, 59, 59, 999);

    const requests = await LeaveRequest.find({
      status: "approved",
      fromDate: { $gte: start, $lte: end },
    }).populate("employee", "name email");

    const rows = requests.map((reqItem) => ({
      Employee: reqItem.employee?.name || "",
      Email: reqItem.employee?.email || "",
      Type: reqItem.typeName,
      Unit: reqItem.leaveUnit || (reqItem.halfDay ? "half_day" : "full_day"),
      HalfSession: reqItem.halfDaySession || "",
      PartialMinutes: reqItem.partialMinutes || 0,
      PartialAt: reqItem.partialDayPosition || "",
      From: reqItem.fromDate?.toISOString().slice(0, 10),
      To: reqItem.toDate?.toISOString().slice(0, 10),
      Days: reqItem.totalDays,
      Status: reqItem.status,
      Remarks: reqItem.remarks || "",
    }));

    const xlsx = await import("xlsx");
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Leave Report");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=leave-report-${month}.xlsx`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: "Failed to export report" });
  }
};
