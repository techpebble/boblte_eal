import express from "express";
import { addCompany, getAllCompany, getCompanyByID, updateCompanyByID } from "../controllers/companyControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addCompany);
router.get("/", protect, authorize('masterdata:view'), getAllCompany);
router.get("/:id", protect, authorize('masterdata:view'), getCompanyByID);
router.put("/:id", protect, authorize('masterdata:manage'), updateCompanyByID);

export default router;