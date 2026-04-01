import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import ticketRoutes from "./routes/ticket.routes.js";
import roleRoutes from "./routes/roleRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import hrRoutes from "./routes/hrRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import assetRoutes from "./routes/assetRoutes.js";

import { ensureDefaultRoles } from "./utils/ensureRoles.js";
import { ensureEmployeeIds } from "./utils/ensureEmployeeIds.js";
import { startAttendanceScheduler } from "./utils/attendanceScheduler.js";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.set("trust proxy", 1);

const allowedOrigins = [
  "https://xiro-fe.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL?.replace(/\/$/, ""),
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.replace(/\/$/, "");

      console.log("Incoming Origin:", normalizedOrigin);

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.log("Blocked origin:", normalizedOrigin);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

const startServer = async () => {
  await connectDB();
  await ensureDefaultRoles();
  await ensureEmployeeIds();
  startAttendanceScheduler();

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/tickets", ticketRoutes);
  app.use("/api", roleRoutes);
  app.use("/api", attendanceRoutes);
  app.use("/api", hrRoutes);
  app.use("/api", financeRoutes);
  app.use("/api", portfolioRoutes);
  app.use("/api", dashboardRoutes);
  app.use("/api", leaveRoutes);
  app.use("/api", assetRoutes);

  app.get("/", (req, res) => {
    res.json({ message: "API running 🚀" });
  });

  app.use((err, req, res, next) => {
    console.error("Server Error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  });

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });
};

startServer();