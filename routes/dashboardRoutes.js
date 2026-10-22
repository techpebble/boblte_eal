import express from "express";
import { getDashboardData } from "../controllers/dashboardControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
const router = express.Router();


router.get("/", protect, authorize('dashboard:view'), getDashboardData);

export default router;
