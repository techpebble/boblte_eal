import express from "express";
import { addEALIssuance, getAllEALIssuances, deleteEALIssuance } from "../controllers/issuanceControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post("/", protect, authorize('issuance:create'), addEALIssuance);
router.get("/", protect, authorize('issuance:view', 'stock:view'), getAllEALIssuances);
router.delete("/:id", protect, authorize('issuance:delete'), deleteEALIssuance);

export default router;