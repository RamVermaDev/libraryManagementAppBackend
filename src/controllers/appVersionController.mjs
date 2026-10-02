import { appVersionModel } from "../models/appVersionModel.mjs";
import { userModel } from "../models/userModel.mjs";
import { getFirebaseMessaging } from "../utils/firebaseAdmin.mjs";

/**
 * Public endpoint: GET /api/app-version
 * Returns the current remote version info and release notes
 */
export const getLatestAppVersion = async (req, res) => {
    try {
        let versionDoc = await appVersionModel.findOne({ isActive: true }).sort({ createdAt: -1 });

        if (!versionDoc) {
            versionDoc = await appVersionModel.create({
                latestVersion: "1.3.4",
                minSupportedVersion: "1.0.0",
                forceUpdate: false,
                releaseNotes: [
                    "Logged-in Devices tracking and remote session logout",
                    "Real-time Admin-to-Admin notification alerts",
                    "Simplified Student Invoices & cleaner receipts",
                    "Performance improvements and stability fixes",
                ],
                downloadUrl: "https://play.google.com/store/apps/details?id=in.vizve.librarydesk",
            });
        }

        return res.status(200).json({
            success: true,
            data: versionDoc,
        });
    } catch (error) {
        console.error("[AppVersion] Error fetching version:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch app version.",
        });
    }
};

/**
 * Admin/Owner endpoint: POST /api/app-version
 * Update or publish a new version
 */
export const setAppVersion = async (req, res) => {
    try {
        const { latestVersion, minSupportedVersion, forceUpdate, releaseNotes, downloadUrl } = req.body;

        if (!latestVersion) {
            return res.status(400).json({
                success: false,
                message: "latestVersion is required.",
            });
        }

        const notesArray = Array.isArray(releaseNotes)
            ? releaseNotes
            : typeof releaseNotes === "string"
            ? releaseNotes.split("\n").filter((s) => s.trim().length > 0)
            : [];

        const newVersion = await appVersionModel.create({
            latestVersion,
            minSupportedVersion: minSupportedVersion || "1.0.0",
            forceUpdate: Boolean(forceUpdate),
            releaseNotes: notesArray,
            downloadUrl: downloadUrl || "https://play.google.com/store/apps/details?id=com.librarydesk.app",
            isActive: true,
        });

        // Set previous versions to isActive: false
        await appVersionModel.updateMany(
            { _id: { $ne: newVersion._id } },
            { $set: { isActive: false } }
        );

        return res.status(201).json({
            success: true,
            message: "App version updated successfully.",
            data: newVersion,
        });
    } catch (error) {
        console.error("[AppVersion] Error setting version:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to update app version.",
        });
    }
};

/**
 * Admin/Owner endpoint: POST /api/app/broadcast-update
 * Sends an FCM push notification to all registered user device tokens
 */
export const broadcastAppUpdate = async (req, res) => {
    try {
        const messaging = getFirebaseMessaging();
        if (!messaging) {
            return res.status(500).json({
                success: false,
                message: "Firebase Messaging not configured on server.",
            });
        }

        const latestDoc = await appVersionModel.findOne({ isActive: true }).sort({ createdAt: -1 });
        const version = latestDoc?.latestVersion || "1.3.3";
        const title = req.body.title || `🚀 Update Available (v${version})`;
        const body =
            req.body.body ||
            `A new version of Library Desk is available with new features and improvements. Tap to update!`;

        // Gather all registered device tokens across all users
        const users = await userModel.find({ "deviceTokens.0": { $exists: true } }).select("deviceTokens").lean();
        const allTokens = [];

        for (const user of users) {
            for (const d of user.deviceTokens || []) {
                if (d.fcmToken && d.fcmToken.trim().length > 10) {
                    allTokens.push(d.fcmToken.trim());
                }
            }
        }

        const uniqueTokens = [...new Set(allTokens)];

        if (!uniqueTokens.length) {
            return res.status(200).json({
                success: true,
                message: "No registered device tokens found.",
                sentCount: 0,
            });
        }

        const stringifiedData = {
            type: "APP_UPDATE",
            version: String(version),
            title: String(title),
            body: String(body),
            downloadUrl: String(latestDoc?.downloadUrl || ""),
        };

        const response = await messaging.sendEachForMulticast({
            tokens: uniqueTokens,
            notification: {
                title,
                body,
            },
            data: stringifiedData,
            android: {
                priority: "high",
                notification: {
                    channelId: "library_desk_alerts_v2",
                    sound: "default",
                    priority: "max",
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    visibility: "public",
                },
            },
        });

        console.log(`[AppVersion] Update notification broadcast sent to ${response.successCount}/${uniqueTokens.length} devices.`);

        return res.status(200).json({
            success: true,
            message: `Update notification broadcast sent to ${response.successCount} devices.`,
            successCount: response.successCount,
            failureCount: response.failureCount,
        });
    } catch (error) {
        console.error("[AppVersion] Error broadcasting update:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to broadcast update notification.",
        });
    }
};
