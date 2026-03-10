import Ticket from "../models/Ticket.js";
import User from "../models/User.js";

// ADMIN: Create Ticket
export const createTicket = async (req, res) => {
  try {
    const { title, description } = req.body;

    const ticket = await Ticket.create({
      title,
      description,
      createdBy: req.user._id, // admin
    });

    res.status(201).json({
      message: "Ticket created successfully",
      ticket,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create ticket" });
  }
};

// ADMIN: Delete Ticket
export const deleteTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    await Ticket.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "Ticket deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete ticket" });
  }
};


// ADMIN: Assign Ticket
export const assignTicket = async (req, res) => {
  try {
    const { userId } = req.body;

    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    ticket.assignedTo = userId;
    await ticket.save();

    res.json({
      message: "Ticket assigned successfully",
      ticket,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to assign ticket" });
  }
};

// ADMIN: Update Ticket Status
export const updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body; // pending / started / completed

    if (!["pending", "started", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    ticket.status = status;
    await ticket.save();

    res.json({
      message: `Ticket status updated to ${status}`,
      ticket,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update ticket status" });
  }
};

// USER: Update own ticket status (started / completed)
export const updateMyTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this ticket" });
    }

    if (!["started", "completed"].includes(status)) {
      return res.status(400).json({ message: "Can only update to 'started' or 'completed'" });
    }

    ticket.status = status;
    await ticket.save();

    res.json({
      message: `Ticket status updated to ${status}`,
      ticket,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update ticket status" });
  }
};

// USER: View assigned tickets
export const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({
      assignedTo: req.user._id,
    })
    .populate("createdBy", "name email")
    .select("title description status assignedTo createdAt updatedAt")
    .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
};

// ADMIN: Get all tickets
export const getAllTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
};
