import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getMyPortfolio } from "../controllers/portfolioController.js";

const router = express.Router();

router.get("/portfolio/me", protect, getMyPortfolio);

export default router;
