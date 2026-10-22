import express from "express";
import {
    getAllUsers,
    getUserByID,
    updateUserByID,
    updateUserStatus,
    resetUserPassword
} from "../controllers/userControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get("/", protect, authorize('users:manage'), getAllUsers);
router.get("/:id", protect, authorize('users:manage'), getUserByID);
router.put("/:id", protect, authorize('users:manage'), updateUserByID);
router.put("/:id/status", protect, authorize('users:manage'), updateUserStatus);
router.put("/:id/password", protect, authorize('users:manage'), resetUserPassword);

export default router;
