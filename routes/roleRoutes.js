import express from "express";
import {
    getAllRoles,
    getRoleByID,
    addRole,
    updateRoleByID,
    deleteRoleByID,
    getPermissionCatalogue
} from "../controllers/roleControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// These are the screens for managing access, so they are guarded now rather
// than in phase 3 with the rest.
router.get("/permissions", protect, authorize('roles:manage'), getPermissionCatalogue);
router.get("/", protect, authorize('roles:manage', 'users:manage'), getAllRoles);
router.get("/:id", protect, authorize('roles:manage'), getRoleByID);
router.post("/", protect, authorize('roles:manage'), addRole);
router.put("/:id", protect, authorize('roles:manage'), updateRoleByID);
router.delete("/:id", protect, authorize('roles:manage'), deleteRoleByID);

export default router;
