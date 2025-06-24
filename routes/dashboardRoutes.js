import express from "express";
import { getAllCompany } from "../controllers/dashboardControllers.js";
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();


router.get("/", protect, getAllCompany);

export default router;