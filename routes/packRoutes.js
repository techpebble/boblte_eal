import express from "express";
import { addPack, getAllPack, getPackByID, updatePackByID } from "../controllers/packControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addPack);
router.get("/", protect, authorize('masterdata:view'), getAllPack);
router.get("/:id", protect, authorize('masterdata:view'), getPackByID);
router.put("/:id", protect, authorize('masterdata:manage'), updatePackByID);

export default router;