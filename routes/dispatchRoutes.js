import express from "express";
import { addDispatch, updateDispatch, addEALLinkToDispatchItem, getAllDispatch, unlinkEALFromDispatchItem, updateDispatchStatus, updateVehicleDetails, getAllEALDispatch, deleteDispatch } from "../controllers/dispatchControllers.js";
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get("/", protect, getAllDispatch);
router.post("/", protect, addDispatch);
router.delete("/:dispatchId", protect, deleteDispatch);
router.put("/:dispatchId", protect, updateDispatch);
router.put('/:dispatchId/status', protect, updateDispatchStatus);
router.put('/:dispatchId/vehicle', protect, updateVehicleDetails);

router.get("/eal", protect, getAllEALDispatch);
router.post("/eal/add_eal_link", protect, addEALLinkToDispatchItem);
router.post("/eal/remove_eal_link", protect, unlinkEALFromDispatchItem);

// to be removed later
router.post("/add_eal_link", protect, addEALLinkToDispatchItem);
router.post("/remove_eal_link", protect, unlinkEALFromDispatchItem);

export default router;