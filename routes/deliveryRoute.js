import express from "express";
import { addDelivery, getAllDelivery, getDeliveryByID, updateDeliveryByID } from "../controllers/deliveryControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addDelivery);
router.get("/", protect, authorize('masterdata:view'), getAllDelivery);
router.get("/:id", protect, authorize('masterdata:view'), getDeliveryByID);
router.put("/:id", protect, authorize('masterdata:manage'), updateDeliveryByID);

export default router;