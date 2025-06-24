import express from "express";
import { addCompany, getAllCompany, getCompanyByID, updateCompanyByID } from "../controllers/companyControllers.js";
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

router.post("/", protect, addCompany);
router.get("/", protect, getAllCompany);
router.get("/:id", protect, getCompanyByID);
router.put("/:id", protect, updateCompanyByID);

export default router;