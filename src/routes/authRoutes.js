import express from "express";
import { 
  signup, 
  login, 
  logout, 
  forgotPassword, 
  resetPassword, 
  updatePassword,
  getProfile,
  updateProfile
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", protect, logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.put("/update-password", protect, updatePassword);
router.get("/me", protect, getProfile);
router.put("/profile", protect, updateProfile);

export default router;
