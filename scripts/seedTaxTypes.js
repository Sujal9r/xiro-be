import mongoose from "mongoose";
import TaxType from "../src/models/TaxType.js";
import connectDB from "../src/config/db.js";

const seedTaxTypes = async () => {
  try {
    await connectDB();

    // Clear existing tax types
    await TaxType.deleteMany({});

    // Income Tax with progressive slabs (Indian tax system example)
    const incomeTax = await TaxType.create({
      name: "Income Tax",
      slug: "income_tax",
      description: "Progressive income tax based on annual salary slabs",
      category: "income_tax",
      calculationType: "progressive",
      frequency: "monthly",
      applicableTo: ["all"],
      thresholdAmount: 50000, // Minimum taxable amount
      taxSlabs: [
        { minAmount: 0, maxAmount: 250000, percentage: 0 }, // Up to 2.5L - 0%
        { minAmount: 250000, maxAmount: 500000, percentage: 5 }, // 2.5L to 5L - 5%
        { minAmount: 500000, maxAmount: 1000000, percentage: 20 }, // 5L to 10L - 20%
        { minAmount: 1000000, maxAmount: null, percentage: 30 }, // Above 10L - 30%
      ],
      exemptions: [
        { name: "HRA Exemption", amount: 50000 },
        { name: "Conveyance Allowance", amount: 19200 },
        { name: "LTA Exemption", amount: 25000 },
      ],
      deductions: [
        { name: "Section 80C", amount: 150000 },
        { name: "Section 80D", amount: 25000 },
      ],
      applicableRoles: ["all"],
      priority: 1,
      isActive: true,
    });

    // Professional Tax (example for Karnataka, India)
    const professionalTax = await TaxType.create({
      name: "Professional Tax",
      slug: "professional_tax",
      description: "State professional tax based on monthly salary",
      category: "professional_tax",
      calculationType: "slab",
      frequency: "monthly",
      applicableTo: ["salaried"],
      thresholdAmount: 21000, // Monthly threshold
      taxSlabs: [
        { minAmount: 21000, maxAmount: 30000, percentage: 2.75 }, // 2.75%
        { minAmount: 30000, maxAmount: 45000, percentage: 4 }, // 4%
        { minAmount: 45000, maxAmount: null, percentage: 6.5 }, // 6.5%
      ],
      exemptions: [],
      deductions: [],
      applicableRoles: ["employee", "manager", "hr", "finance"],
      priority: 2,
      isActive: true,
    });

    // SSF (Social Security Fund)
    const ssf = await TaxType.create({
      name: "Social Security Fund",
      slug: "ssf",
      description: "Social Security Fund contribution",
      category: "social_security",
      calculationType: "percentage",
      frequency: "monthly",
      applicableTo: ["all"],
      thresholdAmount: 0,
      defaultPercentage: 8.33, // 10% of basic salary (8.33% of gross)
      exemptions: [],
      deductions: [],
      applicableRoles: ["all"],
      priority: 3,
      isActive: true,
    });

    console.log("Tax types seeded successfully:");
    console.log(`- ${incomeTax.name} (${incomeTax.category})`);
    console.log(`- ${professionalTax.name} (${professionalTax.category})`);
    console.log(`- ${ssf.name} (${ssf.category})`);

    process.exit(0);
  } catch (error) {
    console.error("Error seeding tax types:", error);
    process.exit(1);
  }
};

seedTaxTypes();