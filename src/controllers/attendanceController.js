import User from "../models/User.js";
import AttendanceLog from "../models/AttendanceLog.js";
import RegularizationRequest from "../models/RegularizationRequest.js";
import { autoClockOutIfNeeded } from "../utils/attendance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import GeofenceSetting from "../models/GeofenceSetting.js";
import OfficeBranch from "../models/OfficeBranch.js";
import { getRegularizationBalanceForUser } from "../utils/regularization.js";

const DEFAULT_SHIFT_START = "10:00";
const DEFAULT_SHIFT_END = "19:00";
const SHIFT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PENALTY_LATE_MINUTES = 15;

const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const resolveShift = (user) => {
  const startCandidate = (user?.shift?.startTime || "").toString().trim();
  const endCandidate = (user?.shift?.endTime || "").toString().trim();
  const startTime = SHIFT_TIME_PATTERN.test(startCandidate)
    ? startCandidate
    : DEFAULT_SHIFT_START;
  const endTime = SHIFT_TIME_PATTERN.test(endCandidate) ? endCandidate : DEFAULT_SHIFT_END;
  return {
    startTime,
    endTime,
    startMinutes: toMinutes(startTime),
    endMinutes: toMinutes(endTime),
  };
};

const getDayMinutes = (date) => date.getHours() * 60 + date.getMinutes();
const parseDateString = (value) => {
  const text = (value || "").toString().trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDayBounds = (value) => {
  const date = parseDateString(value);
  if (!date) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (value) => (value * Math.PI) / 180;

const distanceBetween = (lat1, lng1, lat2, lng2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const isValidCoordinate = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;

// Helper function to check if employee is on leave on a given date
const isEmployeeOnLeave = async (userId, date) => {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const leave = await LeaveRequest.findOne({
    employee: userId,
    status: "approved",
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  });

  return !!leave;
};

const getOrCreateGeofence = async () => {
  let setting = await GeofenceSetting.findOne({ key: "default" });
  if (!setting) {
    setting = await GeofenceSetting.create({ key: "default" });
  }
  return setting;
};

const serializeBranch = (branch) => ({
  id: branch._id,
  name: branch.name,
  code: branch.code || "",
  center: {
    lat: Number(branch.center?.lat || 0),
    lng: Number(branch.center?.lng || 0),
  },
  radiusMeters: Math.max(10, Number(branch.radiusMeters || 250)),
  isActive: branch.isActive !== false,
});

const serializeGeofence = (setting, branches = []) => ({
  enabled: !!setting.enabled,
  name: setting.name || "Office Geofence",
  enforceClockOut: setting.enforceClockOut !== false,
  branches: branches.map(serializeBranch),
});

const assertWithinGeofence = async (req, { enforceClockOut = false } = {}) => {
  const setting = await getOrCreateGeofence();
  const activeBranches = await OfficeBranch.find({ isActive: true }).sort({ createdAt: 1 });
  const geofence = serializeGeofence(setting, activeBranches);
  if (!geofence.enabled) return { geofence, inside: true, distanceMeters: 0 };
  if (enforceClockOut && !geofence.enforceClockOut) {
    return { geofence, inside: true, distanceMeters: 0 };
  }
  if (activeBranches.length === 0) {
    const error = new Error("No office branch area configured");
    error.statusCode = 400;
    throw error;
  }

  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  const hasCoords = isValidCoordinate(latitude, -90, 90) && isValidCoordinate(longitude, -180, 180);

  if (!hasCoords) {
    const error = new Error("Location access is required to clock from office area");
    error.statusCode = 400;
    throw error;
  }

  let nearestDistance = Number.POSITIVE_INFINITY;
  let matchedBranch = null;
  for (const branch of activeBranches) {
    const distanceMeters = distanceBetween(
      Number(branch.center?.lat || 0),
      Number(branch.center?.lng || 0),
      latitude,
      longitude,
    );
    if (distanceMeters < nearestDistance) nearestDistance = distanceMeters;
    if (distanceMeters <= Number(branch.radiusMeters || 0)) {
      matchedBranch = branch;
      nearestDistance = distanceMeters;
      break;
    }
  }

  const inside = !!matchedBranch;
  if (!inside) {
    const error = new Error("You are outside the allowed office area");
    error.statusCode = 403;
    throw error;
  }

  return {
    geofence,
    inside,
    distanceMeters: nearestDistance,
    branch: matchedBranch ? serializeBranch(matchedBranch) : null,
  };
};

export const clockIn = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    const now = new Date();
    
    // Check if employee is on leave today
    const isOnLeave = await isEmployeeOnLeave(user._id, now);
    if (isOnLeave) {
      return res.status(400).json({ 
        message: "You are on leave today. No attendance tracking required.",
        onLeave: true 
      });
    }

    const geoCheck = await assertWithinGeofence(req, { enforceClockOut: false });
    
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const todayLog = await AttendanceLog.findOne({
      user: user._id,
      $or: [
        { date: { $gte: startOfDay, $lte: endOfDay } },
        { checkIn: { $gte: startOfDay, $lte: endOfDay } },
      ],
    }).sort({ checkIn: -1 });

    const ensureSessions = (log) => {
      if (!Array.isArray(log.sessions) || log.sessions.length === 0) {
        if (log.checkIn) {
          log.sessions = [
            {
              checkIn: log.checkIn,
              checkOut: log.checkOut,
              duration: log.duration,
            },
          ];
        }
      }
    };

    if (todayLog) {
      if (!todayLog.checkOut) {
        return res.status(400).json({ message: "Already clocked in" });
      }

      ensureSessions(todayLog);
      todayLog.sessions.push({
        checkIn: now,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
        isLate,
        lateMinutes,
        hasPenalty,
      });
      todayLog.checkOut = undefined;
      todayLog.shiftStartTime = shift.startTime;
      todayLog.shiftEndTime = shift.endTime;
      todayLog.isLate = isLate;
      todayLog.lateMinutes = lateMinutes;
      todayLog.hasPenalty = hasPenalty;
      todayLog.isEarlyClockOut = false;
      if (!todayLog.date) todayLog.date = startOfDay;
      await todayLog.save();
    } else {
      await AttendanceLog.create({
        user: user._id,
        date: startOfDay,
        checkIn: now,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
        isLate,
        lateMinutes,
        hasPenalty,
        sessions: [
          {
            checkIn: now,
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            isLate,
            lateMinutes,
            hasPenalty,
          },
        ],
      });
    }

    const logs = await AttendanceLog.find({ user: user._id }).sort({ checkIn: -1 });
    res.json({ message: "Clocked in", attendanceLogs: logs, geofence: geoCheck.geofence });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || "Failed to clock in" });
  }
};

export const clockOut = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    
    // Check if employee is on leave today
    const isOnLeave = await isEmployeeOnLeave(user._id, now);
    if (isOnLeave) {
      return res.status(400).json({ 
        message: "You are on leave today. No attendance tracking required.",
        onLeave: true 
      });
    }

    const geoCheck = await assertWithinGeofence(req, { enforceClockOut: true });
    const shift = resolveShift(user);
    const isEarlyClockOut = getDayMinutes(now) < shift.endMinutes;
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const todayLog = await AttendanceLog.findOne({
      user: user._id,
      checkOut: { $exists: false },
      $or: [
        { date: { $gte: startOfDay, $lte: endOfDay } },
        { checkIn: { $gte: startOfDay, $lte: endOfDay } },
      ],
    }).sort({ checkIn: -1 });

    if (!todayLog) {
      return res.status(400).json({ message: "No active clock-in" });
    }

    const ensureSessions = (log) => {
      if (!Array.isArray(log.sessions) || log.sessions.length === 0) {
        if (log.checkIn) {
          log.sessions = [
            {
              checkIn: log.checkIn,
              checkOut: log.checkOut,
              duration: log.duration,
            },
          ];
        }
      }
    };

    ensureSessions(todayLog);
    const openSession = [...(todayLog.sessions || [])].reverse().find((s) => !s.checkOut);
    if (!openSession) {
      return res.status(400).json({ message: "No active clock-in" });
    }

    openSession.checkOut = now;
    openSession.shiftStartTime = openSession.shiftStartTime || shift.startTime;
    openSession.shiftEndTime = openSession.shiftEndTime || shift.endTime;
    openSession.isEarlyClockOut = isEarlyClockOut;
    openSession.duration = Math.max(
      0,
      Math.floor((now - new Date(openSession.checkIn)) / (1000 * 60)),
    );

    const totalMinutes = (todayLog.sessions || []).reduce((sum, session) => {
      if (session.duration) return sum + session.duration;
      if (session.checkIn && session.checkOut) {
        return (
          sum +
          Math.max(
            0,
            Math.floor(
              (new Date(session.checkOut) - new Date(session.checkIn)) / (1000 * 60),
            ),
          )
        );
      }
      return sum;
    }, 0);

    todayLog.duration = totalMinutes;
    todayLog.checkOut = now;
    todayLog.shiftStartTime = todayLog.shiftStartTime || shift.startTime;
    todayLog.shiftEndTime = todayLog.shiftEndTime || shift.endTime;
    todayLog.isEarlyClockOut = isEarlyClockOut;
    if (!todayLog.date) todayLog.date = startOfDay;
    await todayLog.save();

    const logs = await AttendanceLog.find({ user: user._id }).sort({ checkIn: -1 });
    res.json({ message: "Clocked out", attendanceLogs: logs, geofence: geoCheck.geofence });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || "Failed to clock out" });
  }
};

export const getGeofenceConfig = async (req, res) => {
  try {
    const setting = await getOrCreateGeofence();
    const branches = await OfficeBranch.find().sort({ createdAt: 1 });
    res.json(serializeGeofence(setting, branches));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch geofence config" });
  }
};

export const updateGeofenceConfig = async (req, res) => {
  try {
    const enabled = req.body?.enabled !== false;
    const name = (req.body?.name || "Office Geofence").toString().trim();
    const enforceClockOut = req.body?.enforceClockOut !== false;

    const setting = await GeofenceSetting.findOneAndUpdate(
      { key: "default" },
      {
        key: "default",
        enabled,
        name: name || "Office Geofence",
        enforceClockOut,
        updatedBy: req.user?._id || null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const branches = await OfficeBranch.find().sort({ createdAt: 1 });
    res.json({ message: "Geofence updated", geofence: serializeGeofence(setting, branches) });
  } catch (error) {
    res.status(500).json({ message: "Failed to update geofence config" });
  }
};

export const createOfficeBranch = async (req, res) => {
  try {
    const name = (req.body?.name || "").toString().trim();
    const code = (req.body?.code || "").toString().trim();
    const centerLat = Number(req.body?.center?.lat);
    const centerLng = Number(req.body?.center?.lng);
    const radiusMeters = Number(req.body?.radiusMeters);
    const isActive = req.body?.isActive !== false;

    if (!name) return res.status(400).json({ message: "Branch name is required" });
    if (!isValidCoordinate(centerLat, -90, 90) || !isValidCoordinate(centerLng, -180, 180)) {
      return res.status(400).json({ message: "Invalid branch center" });
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters < 10 || radiusMeters > 50000) {
      return res.status(400).json({ message: "Branch radius must be 10-50000 meters" });
    }

    const branch = await OfficeBranch.create({
      name,
      code,
      center: { lat: centerLat, lng: centerLng },
      radiusMeters,
      isActive,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    res.status(201).json({ message: "Branch created", branch: serializeBranch(branch) });
  } catch (error) {
    res.status(500).json({ message: "Failed to create office branch" });
  }
};

export const updateOfficeBranch = async (req, res) => {
  try {
    const name = (req.body?.name || "").toString().trim();
    const code = (req.body?.code || "").toString().trim();
    const centerLat = Number(req.body?.center?.lat);
    const centerLng = Number(req.body?.center?.lng);
    const radiusMeters = Number(req.body?.radiusMeters);
    const isActive = req.body?.isActive !== false;

    if (!name) return res.status(400).json({ message: "Branch name is required" });
    if (!isValidCoordinate(centerLat, -90, 90) || !isValidCoordinate(centerLng, -180, 180)) {
      return res.status(400).json({ message: "Invalid branch center" });
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters < 10 || radiusMeters > 50000) {
      return res.status(400).json({ message: "Branch radius must be 10-50000 meters" });
    }

    const branch = await OfficeBranch.findByIdAndUpdate(
      req.params.id,
      {
        name,
        code,
        center: { lat: centerLat, lng: centerLng },
        radiusMeters,
        isActive,
        updatedBy: req.user?._id || null,
      },
      { new: true },
    );
    if (!branch) return res.status(404).json({ message: "Branch not found" });

    res.json({ message: "Branch updated", branch: serializeBranch(branch) });
  } catch (error) {
    res.status(500).json({ message: "Failed to update office branch" });
  }
};

export const deleteOfficeBranch = async (req, res) => {
  try {
    const branch = await OfficeBranch.findByIdAndDelete(req.params.id);
    if (!branch) return res.status(404).json({ message: "Branch not found" });
    res.json({ message: "Branch deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete office branch" });
  }
};

export const createRegularizationRequest = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const type = (req.body?.type || "").toString().trim().toLowerCase();
    if (!["penalty", "logs"].includes(type)) {
      return res.status(400).json({ message: "Invalid regularization type" });
    }

    const balance = await getRegularizationBalanceForUser(user._id);
    if (balance.remaining <= 0) {
      return res.status(400).json({ message: "No regularization balance left" });
    }

    const bounds = buildDayBounds(req.body?.date);
    if (!bounds) {
      return res.status(400).json({ message: "A valid date is required" });
    }

    const attendanceLog = await AttendanceLog.findOne({
      user: user._id,
      $or: [
        { date: { $gte: bounds.start, $lte: bounds.end } },
        { checkIn: { $gte: bounds.start, $lte: bounds.end } },
      ],
    }).sort({ checkIn: -1 });

    let requestedCheckIn = null;
    let requestedCheckOut = null;
    if (type === "logs") {
      requestedCheckIn = parseDateString(req.body?.requestedCheckIn);
      requestedCheckOut = parseDateString(req.body?.requestedCheckOut);
      if (!requestedCheckIn && !requestedCheckOut) {
        return res.status(400).json({
          message: "At least one time is required for log regularization",
        });
      }
      if (requestedCheckIn && requestedCheckOut && requestedCheckOut <= requestedCheckIn) {
        return res.status(400).json({ message: "Check-out must be after check-in" });
      }
    }

    const reason = (req.body?.reason || "").toString().trim();
    const request = await RegularizationRequest.create({
      user: user._id,
      attendanceLog: attendanceLog?._id || null,
      type,
      date: bounds.start,
      requestedCheckIn,
      requestedCheckOut,
      reason,
      status: "pending",
    });

    res.status(201).json({
      message: "Regularization request submitted",
      request,
      regularizationBalance: Math.max(0, balance.remaining - 1),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create regularization request" });
  }
};

export const getMyRegularizationRequests = async (req, res) => {
  try {
    const balance = await getRegularizationBalanceForUser(req.user._id);
    const requests = await RegularizationRequest.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("handledBy", "name email");
    res.json({
      regularizationBalance: balance.remaining,
      requests,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch regularization requests" });
  }
};

export const getAllRegularizationRequests = async (req, res) => {
  try {
    const requests = await RegularizationRequest.find()
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("handledBy", "name email");
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch regularization requests" });
  }
};

export const reviewRegularizationRequest = async (req, res) => {
  try {
    const request = await RegularizationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request already reviewed" });
    }

    const action = (req.body?.action || "").toString().trim().toLowerCase();
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const actionNote = (req.body?.actionNote || "").toString().trim();
    if (action === "approve") {
      const bounds = buildDayBounds(request.date);
      let log = request.attendanceLog
        ? await AttendanceLog.findById(request.attendanceLog)
        : null;
      if (!log && bounds) {
        log = await AttendanceLog.findOne({
          user: request.user,
          $or: [
            { date: { $gte: bounds.start, $lte: bounds.end } },
            { checkIn: { $gte: bounds.start, $lte: bounds.end } },
          ],
        }).sort({ checkIn: -1 });
      }

      if (request.type === "penalty") {
        if (log) {
          log.hasPenalty = false;
          log.lateMinutes = 0;
          log.isLate = false;
          log.isRegularized = true;
          log.regularizedType = "penalty";
          log.regularizedAt = new Date();
          if (Array.isArray(log.sessions)) {
            log.sessions = log.sessions.map((session) => ({
              ...session.toObject?.() || session,
              hasPenalty: false,
              lateMinutes: 0,
              isLate: false,
            }));
          }
          await log.save();
        }
      } else if (request.type === "logs") {
        const fallbackDate = bounds?.start || new Date();
        if (!log) {
          const checkIn = request.requestedCheckIn || fallbackDate;
          const checkOut = request.requestedCheckOut || null;
          const duration =
            checkIn && checkOut
              ? Math.max(0, Math.floor((new Date(checkOut) - new Date(checkIn)) / 60000))
              : undefined;
          log = await AttendanceLog.create({
            user: request.user,
            date: fallbackDate,
            checkIn,
            checkOut,
            duration,
            isLate: false,
            lateMinutes: 0,
            hasPenalty: false,
            sessions: [{ checkIn, checkOut, duration }],
            isRegularized: true,
            regularizedType: "logs",
            regularizedAt: new Date(),
          });
        } else {
          const checkIn = request.requestedCheckIn || log.checkIn;
          const checkOut = request.requestedCheckOut || log.checkOut;
          const duration =
            checkIn && checkOut
              ? Math.max(0, Math.floor((new Date(checkOut) - new Date(checkIn)) / 60000))
              : undefined;
          if (checkIn) log.checkIn = checkIn;
          if (checkOut) log.checkOut = checkOut;
          if (duration !== undefined) log.duration = duration;
          log.isLate = false;
          log.lateMinutes = 0;
          log.hasPenalty = false;
          log.isRegularized = true;
          log.regularizedType = "logs";
          log.regularizedAt = new Date();
          log.sessions = [
            {
              checkIn: log.checkIn,
              checkOut: log.checkOut,
              duration: log.duration,
              hasPenalty: false,
              lateMinutes: 0,
              isLate: false,
            },
          ];
          await log.save();
        }
      }

      request.status = "approved";
      request.actionNote = actionNote;
      request.handledBy = req.user._id;
      request.handledAt = new Date();
      if (log) request.attendanceLog = log._id;
      await request.save();
      return res.json({ message: "Regularization approved", request });
    }

    request.status = "rejected";
    request.actionNote = actionNote;
    request.handledBy = req.user._id;
    request.handledAt = new Date();
    await request.save();
    return res.json({ message: "Regularization rejected", request });
  } catch (error) {
    res.status(500).json({ message: "Failed to review regularization request" });
  }
};

// ===== AUTO CLOCK IN/OUT FOR WFH GEOFENCE =====
export const handleWFHGeofenceEvent = async (req, res) => {
  try {
    const { latitude, longitude, eventType, force } = req.body; // eventType: "enter" or "exit"
    if (!eventType) {
      return res.status(400).json({ message: "Invalid geofence event data" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Allow WFH attendance against a same-day pending or approved WFH request.
    const wfhLeave = await LeaveRequest.findOne({
      employee: user._id,
      status: { $ne: "cancelled" },
      typeKey: "wfh",
      fromDate: { $lte: endOfDay },
      toDate: { $gte: startOfDay },
    }).sort({ createdAt: -1 });

    if (!wfhLeave) {
      return res.status(400).json({ message: "No WFH request found for today" });
    }

    // Check if within WFH geofence
    if (!wfhLeave.geofenceLocation?.latitude) {
      return res.status(400).json({ message: "WFH geofence not set for this leave" });
    }

    const effectiveLatitude = Number.isFinite(latitude)
      ? latitude
      : wfhLeave.geofenceLocation.latitude;
    const effectiveLongitude = Number.isFinite(longitude)
      ? longitude
      : wfhLeave.geofenceLocation.longitude;

    const distanceFromHome = distanceBetween(
      effectiveLatitude,
      effectiveLongitude,
      wfhLeave.geofenceLocation.latitude,
      wfhLeave.geofenceLocation.longitude,
    );

    const geofenceRadius = wfhLeave.geofenceLocation.radius || 100;
    const isWithinGeofence = distanceFromHome <= geofenceRadius;

    // Get or create today's attendance log
    let todayLog = await AttendanceLog.findOne({
      user: user._id,
      $or: [
        { date: { $gte: startOfDay, $lte: endOfDay } },
        { checkIn: { $gte: startOfDay, $lte: endOfDay } },
      ],
    }).sort({ checkIn: -1 });

    const shift = resolveShift(user);

    if (eventType === "enter") {
      // WFH users can clock in from any location once WFH is active.
      if (!todayLog || todayLog.checkOut) {
        // Create or add new session
        const lateMinutes = Math.max(0, getDayMinutes(now) - shift.startMinutes);
        const hasPenalty = false; // No penalty for WFH
        const isLate = lateMinutes > 0;

        if (todayLog && todayLog.checkOut) {
          // Add new session
          if (!Array.isArray(todayLog.sessions)) todayLog.sessions = [];
          todayLog.sessions.push({
            checkIn: now,
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            isLate,
            lateMinutes,
            hasPenalty,
            autoClocked: true,
          });
          todayLog.checkOut = undefined;
          todayLog.isLate = isLate;
          todayLog.lateMinutes = lateMinutes;
          todayLog.hasPenalty = hasPenalty;
          await todayLog.save();
        } else {
          // Create new log
          todayLog = await AttendanceLog.create({
            user: user._id,
            date: startOfDay,
            checkIn: now,
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            isLate,
            lateMinutes,
            hasPenalty,
            sessions: [
              {
                checkIn: now,
                shiftStartTime: shift.startTime,
                shiftEndTime: shift.endTime,
                isLate,
                lateMinutes,
                hasPenalty,
                autoClocked: true,
              },
            ],
          });
        }

        return res.json({
          message: "Clocked in (WFH)",
          attendanceLog: todayLog,
          geofenceDistance: distanceFromHome,
          isWithinGeofence,
        });
      }

      return res.json({
        message: "Already clocked in",
        attendanceLog: todayLog,
        geofenceDistance: distanceFromHome,
        isWithinGeofence,
      });
    }

    if (eventType === "exit") {
      // WFH users can clock out from any location once WFH is active.
      if (todayLog && !todayLog.checkOut) {
        const ensureSessions = (log) => {
          if (!Array.isArray(log.sessions) || log.sessions.length === 0) {
            if (log.checkIn) {
              log.sessions = [
                {
                  checkIn: log.checkIn,
                  checkOut: log.checkOut,
                  duration: log.duration,
                },
              ];
            }
          }
        };

        ensureSessions(todayLog);
        const openSession = [...(todayLog.sessions || [])].reverse().find((s) => !s.checkOut);

        if (openSession) {
          openSession.checkOut = now;
          openSession.autoClocked = true;
          openSession.duration = Math.max(
            0,
            Math.floor((now - new Date(openSession.checkIn)) / (1000 * 60)),
          );

          const totalMinutes = (todayLog.sessions || []).reduce((sum, session) => {
            if (session.duration) return sum + session.duration;
            if (session.checkIn && session.checkOut) {
              return (
                sum +
                Math.max(
                  0,
                  Math.floor(
                    (new Date(session.checkOut) - new Date(session.checkIn)) / (1000 * 60),
                  ),
                )
              );
            }
            return sum;
          }, 0);

          todayLog.duration = totalMinutes;
          todayLog.checkOut = now;
          if (!todayLog.date) todayLog.date = startOfDay;
          await todayLog.save();

          return res.json({
            message: "Clocked out (WFH)",
            attendanceLog: todayLog,
            geofenceDistance: distanceFromHome,
            isWithinGeofence,
          });
        }
      }

      return res.json({
        message: "Not currently clocked in",
        geofenceDistance: distanceFromHome,
        isWithinGeofence,
      });
    }

    return res.json({
      message: "Geofence event processed",
      eventType,
      isWithinGeofence,
      geofenceDistance: distanceFromHome,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || "Failed to process geofence event" });
  }
};

export const getAttendancePanel = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "superadmin" } })
      .select("name email role createdAt employeeId shift")
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endToday = new Date(today);
    endToday.setHours(23, 59, 59, 999);

    const leaves = await LeaveRequest.find({
      status: "approved",
      fromDate: { $lte: endToday },
      toDate: { $gte: today },
    }).select(
      "employee halfDay leaveUnit halfDaySession partialMinutes partialDayPosition fromDate toDate typeName totalDays",
    );

    const leaveMap = leaves.reduce((acc, leave) => {
      const key = leave.employee.toString();
      acc[key] = leave;
      return acc;
    }, {});

    res.json(
      users.map((user) => ({
        ...user.toObject(),
        attendanceLogs: logsMap[user._id.toString()] || [],
        leave: leaveMap[user._id.toString()] || null,
      })),
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch attendance panel" });
  }
};
