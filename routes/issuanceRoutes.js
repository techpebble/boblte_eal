import express from "express";
import { addEALIssuance, getAllEALIssuances, deleteEALIssuance } from "../controllers/issuanceControllers.js";
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post("/", protect, addEALIssuance);
router.get("/", protect, getAllEALIssuances);
router.delete("/:id", protect, deleteEALIssuance);

export default router;