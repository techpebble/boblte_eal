import express from "express";
import { addDispatch, updateDispatch, updateDispatchDate, addEALLinkToDispatchItem, getAllDispatch, getDispatchByID, unlinkEALFromDispatchItem, updateDispatchStatus, updateVehicleDetails, getAllEALDispatch, deleteDispatch } from "../controllers/dispatchControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get("/", protect, authorize('dispatch:view'), getAllDispatch);
router.post("/", protect, authorize('dispatch:create'), addDispatch);
router.delete("/:dispatchId", protect, authorize('dispatch:delete'), deleteDispatch);
router.put("/:dispatchId", protect, authorize('dispatch:edit'), updateDispatch);
router.put('/:dispatchId/status', protect, authorize('dispatch:status'), updateDispatchStatus);
router.put('/:dispatchId/vehicle', protect, authorize('dispatch:status'), updateVehicleDetails);
router.put('/:dispatchId/date', protect, authorize('dispatch:edit'), updateDispatchDate);

router.get("/eal", protect, authorize('dispatch:view'), getAllEALDispatch);
router.post("/eal/add_eal_link", protect, authorize('dispatch:link'), addEALLinkToDispatchItem);
router.post("/eal/remove_eal_link", protect, authorize('dispatch:link'), unlinkEALFromDispatchItem);

// After /eal, or "eal" would be read as a dispatch id.
router.get("/:dispatchId", protect, authorize('dispatch:view'), getDispatchByID);

// to be removed later
router.post("/add_eal_link", protect, authorize('dispatch:link'), addEALLinkToDispatchItem);
router.post("/remove_eal_link", protect, authorize('dispatch:link'), unlinkEALFromDispatchItem);

export default router;