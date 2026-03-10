import AttendanceLog from "../models/AttendanceLog.js";
import { sweepAutoClockOutLogs } from "./attendance.js";

let schedulerTimer = null;
let isSweepRunning = false;

const runSweep = async () => {
  if (isSweepRunning) return;
  isSweepRunning = true;
  try {
    const closed = await sweepAutoClockOutLogs(AttendanceLog);
    if (closed > 0) {
    }
  } catch (error) {
  } finally {
    isSweepRunning = false;
  }
};

export const startAttendanceScheduler = (intervalMs = 60 * 1000) => {
  if (schedulerTimer) return () => {};

  runSweep();
  schedulerTimer = setInterval(runSweep, intervalMs);

  return () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  };
};
