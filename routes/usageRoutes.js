import express from "express";
import { addEALUsage, getAllEALUsage } from "../controllers/usageControllers.js";
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post("/", protect, addEALUsage);
router.get("/", protect, getAllEALUsage);
// router.delete("/:id", protect, deleteEALUsage);

export default router;