import express from "express";
import { addPack, getAllPack, getPackByID, updatePackByID } from "../controllers/packControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
import { MASTERDATA_READERS } from '../config/permissions.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addPack);
router.get("/", protect, authorize(...MASTERDATA_READERS), getAllPack);
router.get("/:id", protect, authorize(...MASTERDATA_READERS), getPackByID);
router.put("/:id", protect, authorize('masterdata:manage'), updatePackByID);

export default router;