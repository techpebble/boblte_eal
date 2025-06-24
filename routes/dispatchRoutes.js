import express from "express";
import { addDispatch, updateDispatch, addEALLinkToDispatchItem, getAllDispatch, unlinkEALFromDispatchItem, updateDispatchStatus, updateVehicleDetails } from "../controllers/dispatchControllers.js";
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post("/", protect, addDispatch);
router.put("/:dispatchId", protect, updateDispatch);
router.post("/add_eal_link", protect, addEALLinkToDispatchItem);
router.post("/remove_eal_link", protect, unlinkEALFromDispatchItem);
router.put('/:dispatchId/status', protect, updateDispatchStatus);
router.put('/:dispatchId/vehicle', protect, updateVehicleDetails);
router.get("/", protect, getAllDispatch);
// router.delete("/:id", protect, deleteEALUsage);

export default router;