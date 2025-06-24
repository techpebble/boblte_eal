import User from "../models/user.js";
import jwt from "jsonwebtoken";

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "10h"});
};

// Register User
export const registerUser = async (req, res) => {
  try {
    const { fullName, email, role, company, password } = req.body;

    if (!fullName || !email || !role || !company || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const user = await User.create({
      fullName,
      email,
      role,
      company,
      password
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({
      id: user._id,
      user: userObj,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error: error.message });
  }
};

// Login User
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    // Convert user doc to object and remove password
    const userObj = user.toObject();
    delete userObj.password;

    res.status(200).json({
      id: user._id,
      user: userObj,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: "Error login user", error: error.message });
  }
};

// Get User
export const getUserInfo = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
            return res.status(404).json({message:"User not found"});
        }
        
        res.status(200).json(user);

    } catch (error) {
        res.status(500).json({message:"Error login user", error: error.message});
    }
};