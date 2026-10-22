import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { can } from "../config/roleHelpers.js";

/**
 * Confirms the caller is signed in and loads their user, with the role and
 * its permissions attached.
 *
 * The permissions are read here rather than carried in the token on purpose:
 * tokens last a year, so a role edited today has to take effect on the next
 * request, not the next time that person happens to log in.
 */
export const protect = async (req, res, next) => {
    let token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({message: "Not authorized, no token"});

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select("-password").populate('role');

        if (!req.user) {
            return res.status(401).json({ message: "Not authorised, user no longer exists" });
        }

        next();
    } catch (error) {
        res.status(401).json({message: "Not authorised, token failed"})
    }

}

export { can } from "../config/roleHelpers.js";

/**
 * Guards a route. Pass the permissions a caller needs; holding any one of
 * them is enough, which keeps routes that serve two purposes simple.
 *
 *   router.post("/", protect, authorize('issuance:create'), addEALIssuance);
 */
export const authorize = (...keys) => (req, res, next) => {
    if (keys.length === 0) return next();

    if (keys.some((key) => can(req.user, key))) return next();

    return res.status(403).json({
        message: 'Your role does not allow this',
        required: keys,
        role: req.user?.role?.name ?? null
    });
};

/**
 * What a query should be narrowed to so a person sees only their own
 * company's records. Someone holding companies:all sees everything.
 *
 * Spread it into a filter:  const filter = { ...companyScope(req), market }
 */
export const companyScope = (req) => {
    if (can(req.user, 'companies:all')) return {};

    const company = req.user?.company;
    if (!company) return {};

    return { company: company._id ?? company };
};
