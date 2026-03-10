import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getDashboard } from "../controllers/dashboardController.js";

const router = express.Router();

router.use(protect);

router.get("/dashboard", getDashboard);

export default router;
