import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { authorizePermissions } from "../middlewares/permissionMiddleware.js";
import { PERMISSIONS } from "../utils/roles.js";


import {
  createTicket,
  deleteTicket,
  assignTicket,
  updateTicketStatus,
  updateMyTicketStatus,
  getMyTickets,
  getAllTickets,
} from "../controllers/ticket.controller.js";

const router = express.Router();

/* ================= ADMIN ROUTES ================= */

// Create ticket
router.post(
  "/create",
  protect,
  authorizePermissions(PERMISSIONS.MANAGE_TICKETS),
  createTicket
);

// Delete ticket
router.delete(
  "/:id",
   protect,
   authorizePermissions(PERMISSIONS.MANAGE_TICKETS),
    deleteTicket
  );

// Assign ticket to user
router.put(
  "/assign/:id",
  protect,
  authorizePermissions(PERMISSIONS.MANAGE_TICKETS),
  assignTicket
);

// Update ticket status (admin)
router.put(
  "/status/:id",
  protect,
  authorizePermissions(PERMISSIONS.MANAGE_TICKETS),
  updateTicketStatus
);

// Get all tickets (admin)
router.get(
  "/all",
  protect,
  authorizePermissions(PERMISSIONS.VIEW_ADMIN_TICKETS),
  getAllTickets
);

/* ================= USER ROUTES ================= */

// User: view assigned tickets
router.get(
  "/my",
  protect,
  authorizePermissions(PERMISSIONS.VIEW_USER_TASKS),
  getMyTickets
);

// User: update own ticket status
router.put(
  "/my/:id",
  protect,
  authorizePermissions(PERMISSIONS.VIEW_USER_TASKS),
  updateMyTicketStatus
);

export default router;
