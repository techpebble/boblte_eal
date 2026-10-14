import express from "express";
import { addDelivery, getAllDelivery, getDeliveryByID, updateDeliveryByID } from "../controllers/deliveryControllers.js";
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, addDelivery);
router.get("/", protect, getAllDelivery);
router.get("/:id", protect, getDeliveryByID);
router.put("/:id", protect, updateDeliveryByID);

export default router;