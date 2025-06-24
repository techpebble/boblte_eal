import express from "express";
import { addDelivery, getAllDelivery } from "../controllers/deliveryControllers.js";
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, addDelivery);
router.get("/", protect, getAllDelivery);

export default router;