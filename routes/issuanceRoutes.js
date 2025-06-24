import express from "express";
import { addEALIssuance, getAllEALIssuances } from "../controllers/issuanceControllers.js";
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post("/", protect, addEALIssuance);
router.get("/", protect, getAllEALIssuances);

export default router;