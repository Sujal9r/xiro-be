import User from "../models/User.js";
import Expense from "../models/Expense.js";
import SalaryHistory from "../models/SalaryHistory.js";

const toPayrollRow = (user) => {
  const salary = Number(user.salary || 0);
  const taxes = Math.round(salary * (user.taxRate ?? 0.1));
  const reimbursement = Number(user.reimbursement || 0);
  const benefits = Number(user.benefits || 0);
  const deductions = Number(user.deductions || 0);
  const netPay = salary - taxes - deductions + benefits + reimbursement;

  return {
    id: user._id.toString(),
    employeeId: user.employeeId || user._id.toString().slice(-6).toUpperCase(),
    name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    role: user.role || "user",
    earnings: salary,
    taxes,
    reimbursement,
    benefits,
    deductions,
    netPay,
    paymentMethod: user.paymentMethod || "Direct deposit",
    changePercent: 0,
  };
};

export const getPayroll = async (req, res) => {
  try {
    const users = await User.find({ isActive: true, role: { $ne: "superadmin" } }).select(
      "name firstName lastName role employeeId salary taxRate benefits deductions reimbursement paymentMethod",
    );
    const items = users.map(toPayrollRow);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch payroll" });
  }
};

export const updateSalary = async (req, res) => {
  try {
    const userId = req.params.id;
    const { salary } = req.body;
    const numericSalary = Number(salary);
    if (!Number.isFinite(numericSalary) || numericSalary < 0) {
      return res.status(400).json({ message: "Invalid salary" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const previousSalary = Number(user.salary || 0);
    user.salary = numericSalary;
    await user.save();

    if (previousSalary !== numericSalary) {
      await SalaryHistory.create({
        user: user._id,
        previousSalary,
        newSalary: numericSalary,
        effectiveDate: new Date(),
        changedBy: req.user?._id,
      });
    }

    res.json(toPayrollRow(user));
  } catch (error) {
    res.status(500).json({ message: "Failed to update salary" });
  }
};

export const getMyFinance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "name firstName lastName role employeeId salary taxRate benefits deductions reimbursement paymentMethod",
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const history = await SalaryHistory.find({ user: user._id })
      .sort({ effectiveDate: -1, createdAt: -1 })
      .limit(50);

    res.json({
      payroll: toPayrollRow(user),
      history: history.map((item) => ({
        id: item._id.toString(),
        previousSalary: item.previousSalary,
        newSalary: item.newSalary,
        effectiveDate: item.effectiveDate,
        changedBy: item.changedBy,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch finance data" });
  }
};
export const listExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1, createdAt: -1 });
    res.json({
      items: expenses.map((expense) => ({
        id: expense._id.toString(),
        title: expense.title,
        category: expense.category,
        amount: expense.amount,
        date: expense.date,
        notes: expense.notes,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch expenses" });
  }
};

export const createExpense = async (req, res) => {
  try {
    const { title, category, amount, date, notes } = req.body;
    if (!title || !title.toString().trim()) {
      return res.status(400).json({ message: "Title is required" });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    const expenseDate = date ? new Date(date) : new Date();
    if (Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const expense = await Expense.create({
      title: title.toString().trim(),
      category: category ? category.toString().trim() : "General",
      amount: numericAmount,
      date: expenseDate,
      notes: notes ? notes.toString().trim() : "",
      createdBy: req.user?._id,
    });

    res.status(201).json({
      id: expense._id.toString(),
      title: expense.title,
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
      notes: expense.notes,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create expense" });
  }
};
