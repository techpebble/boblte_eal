import express from "express";
import { addCompany, getAllCompany, getCompanyByID, updateCompanyByID } from "../controllers/companyControllers.js";
import { protect, authorize } from '../middleware/authMiddleware.js';
import { MASTERDATA_READERS } from '../config/permissions.js';
const router = express.Router();

router.post("/", protect, authorize('masterdata:manage'), addCompany);
router.get("/", protect, authorize(...MASTERDATA_READERS), getAllCompany);
router.get("/:id", protect, authorize(...MASTERDATA_READERS), getCompanyByID);
router.put("/:id", protect, authorize('masterdata:manage'), updateCompanyByID);

export default router;