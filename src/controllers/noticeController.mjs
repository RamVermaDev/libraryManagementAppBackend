import mongoose from "mongoose";
import { noticeModel } from "../models/noticeModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { sendBroadcastToLibraryStudents } from "../services/pushNotificationService.mjs";

/**
 * Broadcast an announcement notice to all students in a library
 * Route: POST /api/notice/:libraryId
 */
export const createNotice = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const { title, message, durationDays = 7 } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: "Invalid Library ID." });
        }

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: "Notice title is required." });
        }

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: "Notice message is required." });
        }

        const allowedDays = [3, 7, 10];
        const parsedDays = parseInt(durationDays, 10);
        const validDays = allowedDays.includes(parsedDays) ? parsedDays : 3;
        const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

        const notice = await noticeModel.create({
            libraryId,
            title: title.trim(),
            message: message.trim(),
            durationDays: validDays,
            expiresAt,
            createdBy: req.user?._id || null,
        });

        // Fetch library name for clean push notification header
        const library = await libraryModel.findById(libraryId).select("libraryName").lean();
        const libName = library?.libraryName || "Library";

        // Broadcast to all active students in this library
        sendBroadcastToLibraryStudents({
            libraryId,
            title: `📢 ${libName} • ${title.trim()}`,
            body: message.trim(),
            data: {
                type: "LIBRARY_NOTICE",
                noticeId: notice._id.toString(),
                libraryName: libName,
            },
        }).then((broadcastResult) => {
            console.log(`[NoticeController] Broadcast completed for notice ${notice._id}:`, broadcastResult);
        }).catch((err) => {
            console.error("[NoticeController] Broadcast push error:", err);
        });

        return res.status(201).json({
            success: true,
            message: "Notice broadcasted successfully.",
            data: notice,
        });
    } catch (error) {
        console.error("createNotice error:", error);
        return res.status(500).json({ success: false, message: "Failed to create notice." });
    }
};

/**
 * Fetch all active notices for a library
 * Route: GET /api/notice/:libraryId
 */
export const getLibraryNotices = async (req, res) => {
    try {
        const { libraryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: "Invalid Library ID." });
        }

        const notices = await noticeModel
            .find({
                libraryId,
                recipientRole: "student",
                expiresAt: { $gt: new Date() },
            })
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Notices retrieved successfully.",
            data: notices,
        });
    } catch (error) {
        console.error("getLibraryNotices error:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve notices." });
    }
};

/**
 * Delete a notice
 * Route: DELETE /api/notice/:libraryId/:noticeId
 */
export const deleteNotice = async (req, res) => {
    try {
        const { libraryId, noticeId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(noticeId)) {
            return res.status(400).json({ success: false, message: "Invalid Library or Notice ID." });
        }

        const deleted = await noticeModel.findOneAndDelete({
            _id: noticeId,
            libraryId,
        });

        if (!deleted) {
            return res.status(404).json({ success: false, message: "Notice not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Notice deleted successfully.",
        });
    } catch (error) {
        console.error("deleteNotice error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete notice." });
    }
};

/**
 * Fetch role-based notifications/alerts (Owner vs Reception)
 * Route: GET /api/:libraryId/alerts
 */
export const getRoleAlerts = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const role = req.appMode || "admin";

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: "Invalid Library ID." });
        }

        const alerts = await noticeModel
            .find({
                libraryId: new mongoose.Types.ObjectId(libraryId),
                recipientRole: { $in: [role.toLowerCase(), "all"] },
                expiresAt: { $gt: new Date() },
            })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const unreadCount = alerts.filter((a) => !a.isRead).length;

        return res.status(200).json({
            success: true,
            message: "Alerts retrieved successfully.",
            data: {
                alerts,
                unreadCount,
            },
        });
    } catch (error) {
        console.error("getRoleAlerts error:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve alerts." });
    }
};

/**
 * Mark a specific role alert as read
 * Route: PATCH /api/:libraryId/alerts/:alertId/read
 */
export const markAlertAsRead = async (req, res) => {
    try {
        const { libraryId, alertId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(alertId)) {
            return res.status(400).json({ success: false, message: "Invalid Library or Alert ID." });
        }

        await noticeModel.updateOne(
            { _id: alertId, libraryId },
            { $set: { isRead: true } }
        );

        return res.status(200).json({
            success: true,
            message: "Alert marked as read.",
        });
    } catch (error) {
        console.error("markAlertAsRead error:", error);
        return res.status(500).json({ success: false, message: "Failed to mark alert as read." });
    }
};

/**
 * Mark all role alerts as read for a library and role
 * Route: PATCH /api/:libraryId/alerts/read-all
 */
export const markAllAlertsAsRead = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const role = req.appMode || "admin";

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: "Invalid Library ID." });
        }

        await noticeModel.updateMany(
            {
                libraryId: new mongoose.Types.ObjectId(libraryId),
                recipientRole: { $in: [role.toLowerCase(), "all"] },
                isRead: false,
            },
            { $set: { isRead: true } }
        );

        return res.status(200).json({
            success: true,
            message: "All alerts marked as read.",
        });
    } catch (error) {
        console.error("markAllAlertsAsRead error:", error);
        return res.status(500).json({ success: false, message: "Failed to mark all alerts as read." });
    }
};
