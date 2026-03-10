export const SHIFT_START_HOUR = 10;
export const SHIFT_END_HOUR = 19;

const SHIFT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseShiftEnd = (value = "") => {
  const time = value.toString().trim();
  if (!SHIFT_TIME_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes, time };
};

const resolveOpenSession = (log) => {
  if (Array.isArray(log.sessions) && log.sessions.length > 0) {
    const open = [...log.sessions].reverse().find((session) => !session.checkOut);
    if (open) return open;
  }
  return null;
};

const resolveShiftEndTime = (log, openSession = null) => {
  const bySession = parseShiftEnd(openSession?.shiftEndTime || "");
  if (bySession) return bySession;

  const byLog = parseShiftEnd(log?.shiftEndTime || "");
  if (byLog) return byLog;

  const byUser = parseShiftEnd(log?.user?.shift?.endTime || "");
  if (byUser) return byUser;

  return { hours: SHIFT_END_HOUR, minutes: 0, time: `${String(SHIFT_END_HOUR).padStart(2, "0")}:00` };
};

const computeTotalMinutes = (log) =>
  (log.sessions || []).reduce((sum, session) => {
    if (session.duration) return sum + session.duration;
    if (session.checkIn && session.checkOut) {
      return (
        sum +
        Math.max(
          0,
          Math.floor((new Date(session.checkOut) - new Date(session.checkIn)) / (1000 * 60)),
        )
      );
    }
    return sum;
  }, 0);

const closeLogAt = (log, endTime, openSession = null) => {
  if (openSession) {
    const checkInTime = new Date(openSession.checkIn);
    openSession.checkOut = endTime;
    openSession.duration = Math.max(
      0,
      Math.floor((endTime - checkInTime) / (1000 * 60)),
    );
    log.duration = computeTotalMinutes(log);
  } else {
    const checkInTime = new Date(log.checkIn);
    const duration = Math.floor((endTime - checkInTime) / (1000 * 60));
    log.duration = Math.max(duration, 0);
  }
  log.checkOut = endTime;
};

export const autoClockOutIfNeeded = async (log, now = new Date()) => {
  if (!log || log.checkOut) return false;

  const openSession = resolveOpenSession(log);
  const checkInTime = openSession ? new Date(openSession.checkIn) : new Date(log.checkIn);
  const shiftEnd = resolveShiftEndTime(log, openSession);
  const endTime = new Date(checkInTime);
  endTime.setHours(shiftEnd.hours, shiftEnd.minutes, 0, 0);

  if (now >= endTime) {
    closeLogAt(log, endTime, openSession);
    return true;
  }

  return false;
};

export const sweepAutoClockOutLogs = async (AttendanceLogModel, options = {}) => {
  const now = options.now || new Date();
  const limit = Number.isFinite(options.limit) ? options.limit : 500;
  const logs = await AttendanceLogModel.find({
    checkOut: { $exists: false },
  })
    .populate("user", "shift")
    .sort({ checkIn: 1 })
    .limit(limit);

  let closedCount = 0;
  for (const log of logs) {
    const closed = await autoClockOutIfNeeded(log, now);
    if (closed) {
      await log.save();
      closedCount += 1;
    }
  }
  return closedCount;
};
