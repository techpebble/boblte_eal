import express from "express";
import { minAppBuild, appDownloadUrl } from "../middleware/requireAppVersion.js";

const router = express.Router();

/**
 * What the app needs to know before it has a session: the oldest build this
 * server will still accept, and where to get a newer one.
 *
 * Deliberately outside `requireAppVersion` and outside `protect` — an app that
 * is about to be refused has to be able to ask why, and it has no token yet.
 */
router.get("/", (req, res) => {
    res.json({
        minBuild: minAppBuild(),
        downloadUrl: appDownloadUrl()
    });
});

export default router;
