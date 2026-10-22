import express from "express";
import { addItem, getAllItem, getItemByID, updateItemByID, updateItemStatus } from "../controllers/itemControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
import { MASTERDATA_READERS } from '../config/permissions.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addItem);
router.get("/", protect, authorize(...MASTERDATA_READERS), getAllItem);
router.get("/:id", protect, authorize(...MASTERDATA_READERS), getItemByID);
router.put("/:id", protect, authorize('masterdata:manage'), updateItemByID);
router.put("/:id/status", protect, authorize('masterdata:manage'), updateItemStatus);
router.patch("/:id/status", protect, authorize('masterdata:manage'), updateItemStatus);

export default router;