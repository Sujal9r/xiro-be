import User from "../models/User.js";
import { generateEmployeeId } from "./employeeId.js";

export const ensureEmployeeIds = async () => {
  const users = await User.find({
    $or: [{ employeeId: { $exists: false } }, { employeeId: "" }, { employeeId: null }],
  }).sort({ createdAt: 1 });

  for (const user of users) {
    user.employeeId = await generateEmployeeId();
    await user.save();
  }

  if (users.length > 0) {
  }
};
