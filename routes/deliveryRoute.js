import express from "express";
import { addDelivery, getAllDelivery, getDeliveryByID, updateDeliveryByID } from "../controllers/deliveryControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
import { MASTERDATA_READERS } from '../config/permissions.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addDelivery);
router.get("/", protect, authorize(...MASTERDATA_READERS), getAllDelivery);
router.get("/:id", protect, authorize(...MASTERDATA_READERS), getDeliveryByID);
router.put("/:id", protect, authorize('masterdata:manage'), updateDeliveryByID);

export default router;