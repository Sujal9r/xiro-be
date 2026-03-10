import Counter from "../models/Counter.js";

const EMPLOYEE_COUNTER_KEY = "employee_id_seq";
const EMPLOYEE_PREFIX = "EMP-";
const EMPLOYEE_PAD = 6;

export const generateEmployeeId = async () => {
  const counter = await Counter.findOneAndUpdate(
    { key: EMPLOYEE_COUNTER_KEY },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  const sequence = counter?.seq || 1;
  return `${EMPLOYEE_PREFIX}${sequence.toString().padStart(EMPLOYEE_PAD, "0")}`;
};
