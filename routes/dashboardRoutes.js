import express from "express";
import { getDashboardData } from "../controllers/dashboardControllers.js";
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();


router.get("/", protect, getDashboardData);

export default router;
