/**
 * Turns away a mobile app too old to be trusted with records.
 *
 * The app sends its build number as `X-App-Version`. No build released before
 * this gate existed ever sent that header, so a request arriving without one
 * is from exactly the app we are trying to keep out: absence is the signal.
 *
 * The refusal is a 403 whose body carries no `required` key, and that shape is
 * load-bearing. The app reads a 403 without `required` as "this session is
 * over": it clears the token, returns to sign-in and shows `message` as it
 * comes (see utils/api_error.dart `endsTheSession`). A 426 Upgrade Required
 * would be the truer status, but the app treats only 401 and 403 as
 * session-ending, so a 426 would show the sentence and then leave the operator
 * on a dead screen.
 *
 * This is a safety rail, not a security boundary: anything can claim to be the
 * web app. It stops a forgotten handset from writing records, not an attacker.
 */

/**
 * The oldest build allowed, or 0 for a gate that is off.
 *
 * Off is the default, and an unreadable value reads as off, on purpose: a
 * missing or fat-fingered environment variable should not be able to lock
 * every handset in the plant out of recording. Turning the gate on is a
 * deliberate act — set MIN_APP_BUILD to the build you have installed.
 */
export const minAppBuild = () => {
    const configured = Number(process.env.MIN_APP_BUILD);
    return Number.isInteger(configured) && configured > 0 ? configured : 0;
};

export const appDownloadUrl = () => process.env.APP_DOWNLOAD_URL || null;

export const UPGRADE_MESSAGE =
    'This version of EAL Track is out of date. Ask your supervisor to install ' +
    'the latest app before recording anything.';

export const requireAppVersion = (req, res, next) => {
    const minBuild = minAppBuild();
    if (minBuild === 0) return next();

    // The web app is deployed by us, not installed on a phone, so it is never
    // the stale client this gate is for. It says so with its own header
    // because a browser has no build number to send.
    if (req.headers['x-client'] === 'web') return next();

    const build = Number(req.headers['x-app-version']);

    if (!Number.isInteger(build) || build < minBuild) {
        return res.status(403).json({
            message: UPGRADE_MESSAGE,
            upgradeRequired: true,
            minBuild,
            downloadUrl: appDownloadUrl()
        });
    }

    next();
};
