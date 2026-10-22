import express from "express";
import { addEALUsage, getAllEALUsage, deleteEALUsage } from "../controllers/usageControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
import { getEALData } from "../controllers/findEALControllers.js";

const router = express.Router();

router.post("/", protect, authorize('usage:create'), addEALUsage);
router.get("/", protect, authorize('usage:view', 'finished:view'), getAllEALUsage);
router.get("/find", protect, authorize('eal:trace'), getEALData);
router.delete("/:id", protect, authorize('usage:delete'), deleteEALUsage);

export default router;