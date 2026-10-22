import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { can } from "../config/roleHelpers.js";
import { PERMISSIONS } from "../config/permissions.js";
import { authFailure } from "../utils/authFailure.js";

/**
 * Confirms the caller is signed in and loads their user, with the role and
 * its permissions attached.
 *
 * The permissions are read here rather than carried in the token on purpose:
 * tokens last a year, so a role edited today has to take effect on the next
 * request, not the next time that person happens to log in.
 *
 * Only a token the server cannot trust is a 401. A database it cannot read
 * is a 503: see utils/authFailure.js.
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

        // Tokens last a year, so switching an account off has to stop it being
        // used straight away rather than whenever the token expires.
        if (req.user.isActive === false) {
            return res.status(403).json({ message: "This account has been switched off" });
        }

        next();
    } catch (error) {
        // The user lookup above is in this try too, so a database that is
        // down or a database user without permission to read the records
        // would otherwise answer "token failed" and sign everyone out.
        const { status, body } = authFailure(error);
        res.status(status).json(body);
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

    // The mobile app shows this message as it comes, so it has to say what
    // was refused and to whom rather than just "not allowed".
    const label = PERMISSIONS.find((permission) => permission.key === keys[0])?.label;
    const roleName = req.user?.role?.name;

    return res.status(403).json({
        message: roleName
            ? `${roleName} is not allowed to ${label ? label.charAt(0).toLowerCase() + label.slice(1) : 'do this'}. Ask an administrator.`
            : 'Your role does not allow this. Ask an administrator.',
        required: keys,
        role: roleName ?? null
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

/**
 * Whether a record belongs to a company this person may work with. Someone
 * holding companies:all may work with every one.
 */
export const inCompanyScope = (req, companyOfRecord) => {
    const scope = companyScope(req);
    if (!scope.company) return true;

    if (!companyOfRecord) return false;
    return String(companyOfRecord._id ?? companyOfRecord) === String(scope.company);
};

/**
 * The sentence to send back when a request reaches into another company, or
 * null when it does not, so a controller reads:
 *
 *   const refusal = companyRefusal(req, issuance.company);
 *   if (refusal) return res.status(403).json({ message: refusal });
 */
export const companyRefusal = (req, companyOfRecord) =>
    inCompanyScope(req, companyOfRecord)
        ? null
        : 'That record belongs to another company. Ask an administrator.';
