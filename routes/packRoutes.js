import express from "express";
import { addPack, getAllPack, getPackByID, updatePackByID } from "../controllers/packControllers.js";
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, addPack);
router.get("/", protect, getAllPack);
router.get("/:id", protect, getPackByID);
router.put("/:id", protect, updatePackByID);

export default router;