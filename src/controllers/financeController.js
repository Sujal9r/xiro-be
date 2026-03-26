import User from "../models/User.js";
import Expense from "../models/Expense.js";
import SalaryHistory from "../models/SalaryHistory.js";
import Tax from "../models/Tax.js";
import TaxType from "../models/TaxType.js";

// ===== TAX CALCULATION UTILITIES =====

/**
 * Calculate tax based on tax slabs (progressive taxation)
 */
const calculateProgressiveTax = (taxableIncome, taxSlabs) => {
  let totalTax = 0;
  const breakdown = [];

  // Sort slabs by minAmount
  const sortedSlabs = taxSlabs.sort((a, b) => a.minAmount - b.minAmount);

  for (let i = 0; i < sortedSlabs.length; i++) {
    const slab = sortedSlabs[i];
    const min = slab.minAmount || 0;
    const max = slab.maxAmount || Infinity;
    const rate = slab.percentage || 0;

    if (taxableIncome <= min) break;

    // Calculate the amount that falls in this slab
    const slabStart = Math.max(taxableIncome, min);
    const slabEnd = Math.min(taxableIncome, max);
    const taxableInThisSlab = Math.max(0, slabEnd - min);

    if (taxableInThisSlab > 0) {
      const taxAmount = Math.round(taxableInThisSlab * rate / 100);
      totalTax += taxAmount;

      breakdown.push({
        slabMin: min,
        slabMax: max === Infinity ? null : max,
        taxableAmount: taxableInThisSlab,
        percentage: rate,
        fixedAmount: slab.fixedAmount || 0,
        calculatedAmount: taxAmount,
      });
    }
  }

  return { totalTax, breakdown };
};

/**
 * Calculate tax based on percentage of income
 */
const calculatePercentageTax = (taxableIncome, percentage) => {
  const totalTax = Math.round(taxableIncome * percentage / 100);
  const breakdown = [{
    slabMin: 0,
    slabMax: null,
    taxableAmount: taxableIncome,
    percentage,
    fixedAmount: 0,
    calculatedAmount: totalTax,
  }];
  return { totalTax, breakdown };
};

/**
 * Calculate fixed amount tax
 */
const calculateFixedTax = (fixedAmount) => {
  const breakdown = [{
    slabMin: 0,
    slabMax: null,
    taxableAmount: 0,
    percentage: 0,
    fixedAmount,
    calculatedAmount: fixedAmount,
  }];
  return { totalTax: fixedAmount, breakdown };
};

/**
 * Apply exemptions and deductions to base salary
 */
const calculateTaxableIncome = (baseSalary, exemptions = [], deductions = []) => {
  let taxableIncome = baseSalary;

  // Apply exemptions (reduce taxable income)
  const totalExemptions = exemptions.reduce((sum, ex) => sum + (ex.amount || 0), 0);
  taxableIncome -= totalExemptions;

  // Apply deductions (reduce taxable income further)
  const totalDeductions = deductions.reduce((sum, ded) => sum + (ded.amount || 0), 0);
  taxableIncome -= totalDeductions;

  return Math.max(0, taxableIncome); // Ensure non-negative
};

/**
 * Main tax calculation function
 */
const calculateTaxForUser = async (userId, taxTypeId, month, year) => {
  try {
    const user = await User.findById(userId).select('salary name employeeId');
    if (!user || !user.salary) return null;

    const taxType = await TaxType.findById(taxTypeId);
    if (!taxType) return null;

    const baseSalary = user.salary;
    const taxableIncome = calculateTaxableIncome(baseSalary, taxType.exemptions, taxType.deductions);

    let calculationResult;

    switch (taxType.calculationType) {
      case 'progressive':
        calculationResult = calculateProgressiveTax(taxableIncome, taxType.taxSlabs || []);
        break;
      case 'percentage':
        calculationResult = calculatePercentageTax(taxableIncome, taxType.defaultPercentage || 0);
        break;
      case 'fixed':
        calculationResult = calculateFixedTax(taxType.defaultPercentage || 0);
        break;
      default:
        return null;
    }

    return {
      user: userId,
      taxType: taxType.name,
      taxTypeId,
      amount: calculationResult.totalTax,
      baseSalary,
      taxableIncome,
      month,
      year,
      payrollMonth: new Date(year, month - 1, 1),
      calculationType: taxType.calculationType,
      calculationBreakdown: calculationResult.breakdown,
      exemptions: taxType.exemptions || [],
      deductions: taxType.deductions || [],
      isAutoCalculated: true,
      status: 'calculated',
    };
  } catch (error) {
    console.error('Tax calculation error:', error);
    return null;
  }
};

const findTaxTypeByName = async (taxTypeName) => {
  if (!taxTypeName) return null;

  return TaxType.findOne({
    name: { $regex: new RegExp(`^${taxTypeName.trim()}$`, "i") },
  });
};

const buildManualTaxRecord = async ({
  user,
  taxTypeName,
  amount,
  percentage,
  month,
  year,
  remarks,
  addedBy,
}) => {
  const baseSalary = Number(user.salary || 0);
  const numericPercentage = Number(percentage) || 0;
  const taxTypeDoc = await findTaxTypeByName(taxTypeName);
  const resolvedAmount =
    Number(amount) > 0 ? Number(amount) : Math.round(baseSalary * numericPercentage / 100);

  if (resolvedAmount <= 0) {
    throw new Error("Tax amount must be greater than zero");
  }

  return {
    user: user._id,
    taxType: taxTypeDoc?.name || taxTypeName.toString().trim(),
    taxTypeId: taxTypeDoc?._id,
    amount: resolvedAmount,
    baseSalary,
    taxableIncome: baseSalary,
    month: Number(month),
    year: Number(year),
    payrollMonth: new Date(Number(year), Number(month) - 1, 1),
    calculationType: numericPercentage > 0 ? "percentage" : (taxTypeDoc?.calculationType || "fixed"),
    calculationBreakdown: [
      {
        slabMin: 0,
        slabMax: null,
        taxableAmount: baseSalary,
        percentage: numericPercentage,
        fixedAmount: numericPercentage > 0 ? 0 : resolvedAmount,
        calculatedAmount: resolvedAmount,
      },
    ],
    exemptions: [],
    deductions: [],
    isAutoCalculated: false,
    isManualOverride: false,
    originalAmount: resolvedAmount,
    remarks: remarks ? remarks.toString().trim() : "",
    addedBy,
    status: "calculated",
    salary: baseSalary,
    percentage: numericPercentage,
  };
};

const toPayrollRow = async (user, month = null, year = null) => {
  const salary = Number(user.salary || 0);
  const reimbursement = Number(user.reimbursement || 0);
  const benefits = Number(user.benefits || 0);
  const deductions = Number(user.deductions || 0);

  // Get tax amount - either from manual taxes or auto-calculated
  let taxAmount = 0;
  if (month && year) {
    // Get taxes for specific month/year
    const taxes = await Tax.find({
      user: user._id,
      month: Number(month),
      year: Number(year),
      status: { $ne: 'cancelled' }
    });
    taxAmount = taxes.reduce((sum, tax) => sum + tax.amount, 0);
  } else {
    // Fallback to old calculation for general payroll view
    taxAmount = Math.round(salary * (user.taxRate ?? 0.1));
  }

  const netPay = salary - taxAmount - deductions + benefits + reimbursement;

  return {
    id: user._id.toString(),
    employeeId: user.employeeId || user._id.toString().slice(-6).toUpperCase(),
    name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    role: user.role || "user",
    earnings: salary,
    taxes: taxAmount,
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
    const { month, year } = req.query;
    const users = await User.find({ isActive: true, role: { $ne: "superadmin" } }).select(
      "name firstName lastName role employeeId salary taxRate benefits deductions reimbursement paymentMethod",
    );

    const currentDate = new Date();
    const payrollMonth = month ? Number(month) : currentDate.getMonth() + 1;
    const payrollYear = year ? Number(year) : currentDate.getFullYear();

    const items = await Promise.all(users.map(user => toPayrollRow(user, payrollMonth, payrollYear)));
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

    const currentDate = new Date();
    const payrollMonth = currentDate.getMonth() + 1;
    const payrollYear = currentDate.getFullYear();

    const history = await SalaryHistory.find({ user: user._id })
      .sort({ effectiveDate: -1, createdAt: -1 })
      .limit(50);

    res.json({
      payroll: await toPayrollRow(user, payrollMonth, payrollYear),
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

// ===== TAX MANAGEMENT =====
export const getTaxTypes = async (req, res) => {
  try {
    const taxTypes = await TaxType.find({ isActive: true }).sort({ name: 1 });
    res.json({
      items: taxTypes.map((type) => ({
        id: type._id.toString(),
        name: type.name,
        slug: type.slug,
        description: type.description,
        defaultPercentage: type.defaultPercentage,
        isPercentageBased: type.isPercentageBased,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tax types" });
  }
};

export const createTaxType = async (req, res) => {
  try {
    const { name, description, defaultPercentage, isPercentageBased } = req.body;
    if (!name || !name.toString().trim()) {
      return res.status(400).json({ message: "Tax type name is required" });
    }

    const slug = name
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");

    const existing = await TaxType.findOne({ slug });
    if (existing) {
      return res.status(400).json({ message: "Tax type already exists" });
    }

    const taxType = await TaxType.create({
      name: name.toString().trim(),
      slug,
      description: description ? description.toString().trim() : "",
      defaultPercentage: Number(defaultPercentage) || 0,
      isPercentageBased: Boolean(isPercentageBased),
    });

    res.status(201).json({
      id: taxType._id.toString(),
      name: taxType.name,
      slug: taxType.slug,
      description: taxType.description,
      defaultPercentage: taxType.defaultPercentage,
      isPercentageBased: taxType.isPercentageBased,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create tax type" });
  }
};

export const updateTaxType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, defaultPercentage, isPercentageBased, isActive } = req.body;

    const taxType = await TaxType.findById(id);
    if (!taxType) {
      return res.status(404).json({ message: "Tax type not found" });
    }

    if (name) taxType.name = name.toString().trim();
    if (description !== undefined) taxType.description = description.toString().trim();
    if (defaultPercentage !== undefined) taxType.defaultPercentage = Number(defaultPercentage);
    if (isPercentageBased !== undefined) taxType.isPercentageBased = Boolean(isPercentageBased);
    if (isActive !== undefined) taxType.isActive = Boolean(isActive);

    await taxType.save();

    res.json({
      id: taxType._id.toString(),
      name: taxType.name,
      slug: taxType.slug,
      description: taxType.description,
      defaultPercentage: taxType.defaultPercentage,
      isPercentageBased: taxType.isPercentageBased,
      isActive: taxType.isActive,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update tax type" });
  }
};

export const addTax = async (req, res) => {
  try {
    const { userId, taxType, amount, percentage, month, year, remarks } = req.body;

    if (!userId || !taxType || !month || !year) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const taxPayload = await buildManualTaxRecord({
      user,
      taxTypeName: taxType,
      amount,
      percentage,
      month,
      year,
      remarks,
      addedBy: req.user?._id,
    });

    const tax = await Tax.create(taxPayload);

    res.status(201).json({
      id: tax._id.toString(),
      user: tax.user.toString(),
      taxType: tax.taxType,
      amount: tax.amount,
      percentage: tax.percentage,
      month: tax.month,
      year: tax.year,
      remarks: tax.remarks,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add tax" });
  }
};

export const bulkApplyTaxes = async (req, res) => {
  try {
    const { month, year, taxConfigurations } = req.body;

    if (!month || !year || !Array.isArray(taxConfigurations) || taxConfigurations.length === 0) {
      return res.status(400).json({ message: "Month, year, and tax configurations are required" });
    }

    const created = [];
    const skipped = [];
    const errors = [];

    for (const config of taxConfigurations) {
      const {
        taxType,
        amount,
        percentage,
        remarks,
        applyToAll = true,
        employeeIds = [],
      } = config;

      if (!taxType || (!Number(amount) && !Number(percentage))) {
        errors.push({
          taxType: taxType || "Unknown",
          error: "Tax type and amount or percentage are required",
        });
        continue;
      }

      const userFilter = { isActive: true, role: { $ne: "superadmin" } };
      if (!applyToAll) {
        userFilter._id = { $in: employeeIds };
      }

      const users = await User.find(userFilter).select("_id name employeeId salary");

      for (const user of users) {
        try {
          const existingTax = await Tax.findOne({
            user: user._id,
            taxType: taxType.toString().trim(),
            month: Number(month),
            year: Number(year),
          });

          if (existingTax) {
            skipped.push({
              employee: user.name,
              employeeId: user.employeeId,
              taxType,
              reason: "Tax already exists",
            });
            continue;
          }

          const taxPayload = await buildManualTaxRecord({
            user,
            taxTypeName: taxType,
            amount,
            percentage,
            month,
            year,
            remarks,
            addedBy: req.user?._id,
          });

          const tax = await Tax.create(taxPayload);
          created.push({
            id: tax._id.toString(),
            employee: user.name,
            employeeId: user.employeeId,
            taxType: tax.taxType,
            amount: tax.amount,
          });
        } catch (error) {
          errors.push({
            employee: user.name,
            employeeId: user.employeeId,
            taxType,
            error: error.message,
          });
        }
      }
    }

    res.status(201).json({
      message: `Bulk tax application completed. Created: ${created.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`,
      created,
      skipped,
      errors,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to apply bulk taxes" });
  }
};

export const getTaxesByUser = async (req, res) => {
  try {
    const { userId, month, year } = req.query;
    let filter = {};

    if (userId) filter.user = userId;
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);

    const taxes = await Tax.find(filter)
      .populate("user", "name employeeId salary")
      .populate("taxTypeId", "name category calculationType")
      .populate("addedBy", "name")
      .sort({ year: -1, month: -1, createdAt: -1 });

    const totalTax = taxes.reduce((sum, tax) => sum + tax.amount, 0);

    res.json({
      items: taxes.map((tax) => ({
        id: tax._id.toString(),
        user: {
          id: tax.user._id.toString(),
          name: tax.user.name,
          employeeId: tax.user.employeeId,
        },
        taxType: tax.taxType,
        taxTypeId: tax.taxTypeId?._id?.toString(),
        taxCategory: tax.taxTypeId?.category,
        calculationType: tax.calculationType,
        amount: tax.amount,
        baseSalary: tax.baseSalary,
        taxableIncome: tax.taxableIncome,
        month: tax.month,
        year: tax.year,
        calculationBreakdown: tax.calculationBreakdown,
        exemptions: tax.exemptions,
        deductions: tax.deductions,
        isAutoCalculated: tax.isAutoCalculated,
        isManualOverride: tax.isManualOverride,
        originalAmount: tax.originalAmount,
        remarks: tax.remarks,
        status: tax.status,
        addedBy: tax.addedBy ? tax.addedBy.name : null,
        createdAt: tax.createdAt,
        // Backward compatibility
        salary: tax.salary || tax.baseSalary,
        percentage: tax.percentage || 0,
      })),
      total: totalTax,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch taxes" });
  }
};

export const updateTax = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, percentage, remarks } = req.body;

    const tax = await Tax.findById(id);
    if (!tax) {
      return res.status(404).json({ message: "Tax record not found" });
    }

    if (amount !== undefined) tax.amount = Number(amount);
    if (percentage !== undefined) tax.percentage = Number(percentage);
    if (remarks !== undefined) tax.remarks = remarks.toString().trim();

    await tax.save();

    res.json({
      id: tax._id.toString(),
      amount: tax.amount,
      percentage: tax.percentage,
      remarks: tax.remarks,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update tax" });
  }
};

export const deleteTax = async (req, res) => {
  try {
    const { id } = req.params;
    const tax = await Tax.findByIdAndDelete(id);

    if (!tax) {
      return res.status(404).json({ message: "Tax record not found" });
    }

    res.json({ message: "Tax record deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete tax" });
  }
};

export const autoCalculateTaxes = async (req, res) => {
  try {
    const { month, year, taxTypeIds, employeeIds } = req.body;

    if (!month || !year || !taxTypeIds || !Array.isArray(taxTypeIds)) {
      return res.status(400).json({ message: "Month, year, and tax type IDs are required" });
    }

    // Get employees to process
    let employeeFilter = { isActive: true, role: { $ne: "superadmin" } };
    if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
      employeeFilter._id = { $in: employeeIds };
    }

    const employees = await User.find(employeeFilter).select("_id name employeeId salary");
    if (employees.length === 0) {
      return res.status(400).json({ message: "No employees found to process" });
    }

    // Get tax types
    const taxTypes = await TaxType.find({
      _id: { $in: taxTypeIds },
      isActive: true
    });

    if (taxTypes.length === 0) {
      return res.status(400).json({ message: "No valid tax types found" });
    }

    const createdTaxes = [];
    const skippedTaxes = [];
    const errors = [];

    // Process each employee and tax type
    for (const employee of employees) {
      for (const taxType of taxTypes) {
        try {
          // Check if tax already exists
          const existingTax = await Tax.findOne({
            user: employee._id,
            taxTypeId: taxType._id,
            month: Number(month),
            year: Number(year),
          });

          if (existingTax) {
            skippedTaxes.push({
              employee: employee.name,
              taxType: taxType.name,
              reason: "Tax already exists",
            });
            continue;
          }

          // Calculate tax
          const taxData = await calculateTaxForUser(employee._id, taxType._id, Number(month), Number(year));
          if (!taxData) {
            errors.push({
              employee: employee.name,
              taxType: taxType.name,
              error: "Failed to calculate tax",
            });
            continue;
          }

          // Create tax record
          const tax = await Tax.create({
            ...taxData,
            addedBy: req.user?._id,
          });

          createdTaxes.push({
            id: tax._id.toString(),
            employee: employee.name,
            taxType: taxType.name,
            amount: tax.amount,
            taxableIncome: tax.taxableIncome,
            calculationType: tax.calculationType,
          });
        } catch (error) {
          console.error(`Error processing tax for ${employee.name} - ${taxType.name}:`, error);
          errors.push({
            employee: employee.name,
            taxType: taxType.name,
            error: error.message,
          });
        }
      }
    }

    res.json({
      message: `Auto tax calculation completed. Created: ${createdTaxes.length}, Skipped: ${skippedTaxes.length}, Errors: ${errors.length}`,
      created: createdTaxes,
      skipped: skippedTaxes,
      errors,
      totalEmployees: employees.length,
      totalTaxTypes: taxTypes.length,
    });
  } catch (error) {
    console.error("Auto tax calculation error:", error);
    res.status(500).json({ message: "Failed to auto calculate taxes" });
  }
};

// ===== PAYROLL REPORTS =====
export const getMonthlyPayroll = async (req, res) => {
  try {
    const { month, year, employeeId } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }

    let userFilter = { isActive: true, role: { $ne: "superadmin" } };
    if (employeeId) {
      userFilter = { ...userFilter, employeeId };
    }

    const users = await User.find(userFilter).select(
      "name firstName lastName employeeId salary taxRate benefits deductions reimbursement paymentMethod",
    );

    const payrollData = await Promise.all(
      users.map(async (user) => {
        const salary = Number(user.salary || 0);
        const manualTaxes = await Tax.find({
          user: user._id,
          month: Number(month),
          year: Number(year),
        });

        const manualTaxTotal = manualTaxes.reduce((sum, tax) => sum + tax.amount, 0);
        const autoTax = Math.round(salary * (user.taxRate ?? 0.1));
        const totalTax = manualTaxTotal > 0 ? manualTaxTotal : autoTax;

        const reimbursement = Number(user.reimbursement || 0);
        const benefits = Number(user.benefits || 0);
        const deductions = Number(user.deductions || 0);
        const netPay = salary - totalTax - deductions + benefits + reimbursement;

        return {
          id: user._id.toString(),
          employeeId: user.employeeId || user._id.toString().slice(-6).toUpperCase(),
          name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          role: user.role,
          salary,
          autoCalculatedTax: autoTax,
          manualTaxes: manualTaxes.map((t) => ({
            type: t.taxType,
            amount: t.amount,
          })),
          totalTax,
          benefits,
          deductions,
          reimbursement,
          netPay,
          paymentMethod: user.paymentMethod || "Direct deposit",
        };
      }),
    );

    const summary = {
      month: Number(month),
      year: Number(year),
      totalEmployees: payrollData.length,
      totalSalary: payrollData.reduce((sum, p) => sum + p.salary, 0),
      totalTax: payrollData.reduce((sum, p) => sum + p.totalTax, 0),
      totalBenefits: payrollData.reduce((sum, p) => sum + p.benefits, 0),
      totalDeductions: payrollData.reduce((sum, p) => sum + p.deductions, 0),
      totalReimbursement: payrollData.reduce((sum, p) => sum + p.reimbursement, 0),
      totalNetPay: payrollData.reduce((sum, p) => sum + p.netPay, 0),
    };

    res.json({
      summary,
      payroll: payrollData,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch monthly payroll" });
  }
};

export const getAnnualPayroll = async (req, res) => {
  try {
    const { year, employeeId } = req.query;

    if (!year) {
      return res.status(400).json({ message: "Year is required" });
    }

    let userFilter = { isActive: true, role: { $ne: "superadmin" } };
    if (employeeId) {
      userFilter = { ...userFilter, employeeId };
    }

    const users = await User.find(userFilter).select(
      "name firstName lastName employeeId salary taxRate benefits deductions reimbursement paymentMethod",
    );

    const payrollData = await Promise.all(
      users.map(async (user) => {
        const salary = Number(user.salary || 0);
        const allYearlyTaxes = await Tax.find({
          user: user._id,
          year: Number(year),
        });

        const totalManualTax = allYearlyTaxes.reduce((sum, tax) => sum + tax.amount, 0);
        const autoTax = Math.round(salary * 12 * (user.taxRate ?? 0.1));
        const totalTax = totalManualTax > 0 ? totalManualTax : autoTax;

        const annualSalary = salary * 12;
        const reimbursement = Number(user.reimbursement || 0) * 12;
        const benefits = Number(user.benefits || 0) * 12;
        const deductions = Number(user.deductions || 0) * 12;
        const netPay = annualSalary - totalTax - deductions + benefits + reimbursement;

        return {
          id: user._id.toString(),
          employeeId: user.employeeId || user._id.toString().slice(-6).toUpperCase(),
          name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          role: user.role,
          monthlySalary: salary,
          annualSalary,
          totalTax,
          benefits,
          deductions,
          reimbursement,
          netPay,
          taxBreakdown: allYearlyTaxes.map((t) => ({
            type: t.taxType,
            month: t.month,
            amount: t.amount,
          })),
        };
      }),
    );

    const summary = {
      year: Number(year),
      totalEmployees: payrollData.length,
      totalAnnualSalary: payrollData.reduce((sum, p) => sum + p.annualSalary, 0),
      totalTax: payrollData.reduce((sum, p) => sum + p.totalTax, 0),
      totalBenefits: payrollData.reduce((sum, p) => sum + p.benefits, 0),
      totalDeductions: payrollData.reduce((sum, p) => sum + p.deductions, 0),
      totalReimbursement: payrollData.reduce((sum, p) => sum + p.reimbursement, 0),
      totalNetPay: payrollData.reduce((sum, p) => sum + p.netPay, 0),
    };

    res.json({
      summary,
      payroll: payrollData,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch annual payroll" });
  }
};
