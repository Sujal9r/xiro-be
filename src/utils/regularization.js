import LeavePolicy from "../models/LeavePolicy.js";
import RegularizationRequest from "../models/RegularizationRequest.js";

const DEFAULT_REGULARIZATION_BALANCE = 5;
const DEFAULT_RESET_MONTH = 1;
const DEFAULT_RESET_DAY = 1;

const getPolicySnapshot = async () => {
  const policy = await LeavePolicy.findOne().select(
    "regularizationBalance resetMonth resetDay",
  );
  return {
    regularizationBalance: Math.max(
      0,
      Number(policy?.regularizationBalance ?? DEFAULT_REGULARIZATION_BALANCE),
    ),
    resetMonth: Number(policy?.resetMonth || DEFAULT_RESET_MONTH),
    resetDay: Number(policy?.resetDay || DEFAULT_RESET_DAY),
  };
};

const getPeriodStart = (resetMonth, resetDay, referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const start = new Date(year, resetMonth - 1, resetDay);
  if (referenceDate < start) {
    start.setFullYear(year - 1);
  }
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getRegularizationBalanceForUser = async (userId) => {
  const policy = await getPolicySnapshot();
  const periodStart = getPeriodStart(policy.resetMonth, policy.resetDay, new Date());
  const used = await RegularizationRequest.countDocuments({
    user: userId,
    status: { $ne: "rejected" },
    createdAt: { $gte: periodStart },
  });
  return {
    allowance: policy.regularizationBalance,
    used,
    remaining: Math.max(0, policy.regularizationBalance - used),
    periodStart,
  };
};

