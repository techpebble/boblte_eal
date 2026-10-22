import User from "../models/user.js";
import jwt from "jsonwebtoken";
import Role from "../models/role.js";
import { ADMIN_ROLE_NAME, can } from "../config/roleHelpers.js";
import { companyRefusal } from "../middleware/authMiddleware.js";

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: 31536000 });
};

// Register User
export const registerUser = async (req, res) => {
  try {
    const { fullName, email, role, company, password, mobile  } = req.body;

    if (!fullName || !email || !role || !company || !password || !mobile) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // On an empty install there is no signed-in user yet, and companyRefusal
    // lets that through; after that it holds whoever is adding people to
    // their own company unless they hold companies:all.
    const refusal = companyRefusal(req, company);
    if (refusal) {
      return res.status(403).json({ message: refusal });
    }

    // This used to be open to anyone who could reach the API, which meant
    // anyone could make themselves an administrator. It is now reserved for
    // someone who may manage users — except on an empty install, where there
    // is nobody to grant that yet.
    const existingUsers = await User.countDocuments();

    if (existingUsers > 0 && !can(req.user, 'users:manage')) {
      return res.status(req.user ? 403 : 401).json({
        message: req.user
          ? 'Your role does not allow adding users'
          : 'Not authorized, no token'
      });
    }

    const roleRecord = await Role.findById(role);

    if (!roleRecord) {
      return res.status(400).json({ message: 'Pick a role that exists' });
    }

    // Only someone who may manage roles can hand out the unrestricted one.
    if (roleRecord.name === ADMIN_ROLE_NAME && existingUsers > 0 && !can(req.user, 'roles:manage')) {
      return res.status(403).json({ message: `Your role does not allow granting ${ADMIN_ROLE_NAME}` });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const user = await User.create({
      fullName,
      email,
      mobile,
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
    const user = await User.findOne({
      $or: [
        { email },
        { mobile: email }  // assuming your User schema has a 'mobile' field
      ]
    }).select('+password').populate('role');
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
        const user = await User.findById(req.user.id).select('-password').populate('role');

        if (!user) {
            return res.status(404).json({message:"User not found"});
        }
        
        res.status(200).json(user);

    } catch (error) {
        res.status(500).json({message:"Error login user", error: error.message});
    }
};