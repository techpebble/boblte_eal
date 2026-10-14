import express from "express";
import { addItem, getAllItem, getItemByID, updateItemByID, updateItemStatus } from "../controllers/itemControllers.js";
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, addItem);
router.get("/", protect, getAllItem);
router.get("/:id", protect, getItemByID);
router.put("/:id", protect, updateItemByID);
router.put("/:id/status", protect, updateItemStatus);
router.patch("/:id/status", protect, updateItemStatus);

export default router;