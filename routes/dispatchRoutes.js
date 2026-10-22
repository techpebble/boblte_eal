import express from "express";
import { addDispatch, updateDispatch, addEALLinkToDispatchItem, getAllDispatch, unlinkEALFromDispatchItem, updateDispatchStatus, updateVehicleDetails, getAllEALDispatch, deleteDispatch } from "../controllers/dispatchControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get("/", protect, authorize('dispatch:view'), getAllDispatch);
router.post("/", protect, authorize('dispatch:create'), addDispatch);
router.delete("/:dispatchId", protect, authorize('dispatch:delete'), deleteDispatch);
router.put("/:dispatchId", protect, authorize('dispatch:edit'), updateDispatch);
router.put('/:dispatchId/status', protect, authorize('dispatch:status'), updateDispatchStatus);
router.put('/:dispatchId/vehicle', protect, authorize('dispatch:status'), updateVehicleDetails);

router.get("/eal", protect, authorize('dispatch:view'), getAllEALDispatch);
router.post("/eal/add_eal_link", protect, authorize('dispatch:link'), addEALLinkToDispatchItem);
router.post("/eal/remove_eal_link", protect, authorize('dispatch:link'), unlinkEALFromDispatchItem);

// to be removed later
router.post("/add_eal_link", protect, authorize('dispatch:link'), addEALLinkToDispatchItem);
router.post("/remove_eal_link", protect, authorize('dispatch:link'), unlinkEALFromDispatchItem);

export default router;