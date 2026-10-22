import express from "express";
import { registerUser, loginUser, getUserInfo } from "../controllers/authControllers.js";
import { protect } from '../middleware/authMiddleware.js';

// Registration reads the caller when there is one, so it can tell an
// administrator adding a colleague from the very first account on an empty
// install. The controller decides; this only makes req.user available.
const maybeProtect = (req, res, next) =>
    req.headers.authorization ? protect(req, res, next) : next();
import { upload } from "../middleware/uploadMiddleware.js";


const router = express.Router();

router.post("/register", maybeProtect, registerUser);
router.post("/login", loginUser);
router.get("/getUser", protect, getUserInfo);
router.post("/uploadImage", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({message: "No file uploaded"})
    }
    console.log(req.file);
    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    res.status(200).json({imageUrl});
});

export default router;