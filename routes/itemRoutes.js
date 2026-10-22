import express from "express";
import { addItem, getAllItem, getItemByID, updateItemByID, updateItemStatus } from "../controllers/itemControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addItem);
router.get("/", protect, authorize('masterdata:view'), getAllItem);
router.get("/:id", protect, authorize('masterdata:view'), getItemByID);
router.put("/:id", protect, authorize('masterdata:manage'), updateItemByID);
router.put("/:id/status", protect, authorize('masterdata:manage'), updateItemStatus);
router.patch("/:id/status", protect, authorize('masterdata:manage'), updateItemStatus);

export default router;