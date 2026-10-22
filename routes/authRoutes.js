import express from "express";
import { registerUser, loginUser, getUserInfo } from "../controllers/authControllers.js";
import { protect } from '../middleware/authMiddleware.js';

// Registration reads the caller when there is one, so it can tell an
// administrator adding a colleague from the very first account on an empty
// install. The controller decides; this only makes req.user available.
const maybeProtect = (req, res, next) =>
    req.headers.authorization ? protect(req, res, next) : next();


const router = express.Router();

router.post("/register", maybeProtect, registerUser);
router.post("/login", loginUser);
router.get("/getUser", protect, getUserInfo);

export default router;