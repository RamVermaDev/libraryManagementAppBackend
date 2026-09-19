import { getFirebaseMessaging } from "../utils/firebaseAdmin.mjs";
import { studentModel } from "../models/studentModel.mjs";
import { userModel } from "../models/userModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { noticeModel } from "../models/noticeModel.mjs";

/**
 * Send push notification to a specific student via their registered FCM token
 * @param {Object} params
 * @param {string} params.studentId - MongoDB _id of the student
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {Object} [params.data] - Custom key-value pairs (payload)
 */
export const sendPushNotificationToStudent = async ({ studentId, title, body, data = {} }) => {
    try {
        const student = await studentModel.findById(studentId).select("fcmToken name");
        if (!student || !student.fcmToken) {
            console.log(`[PushNotification] No FCM token for student ${studentId} (${student?.name || "Unknown"})`);
            return { success: false, reason: "NO_FCM_TOKEN" };
        }

        const messaging = getFirebaseMessaging();
        if (!messaging) {
            console.warn("[PushNotification] Firebase Messaging not initialized.");
            return { success: false, reason: "FIREBASE_NOT_INITIALIZED" };
        }

        const stringifiedData = {};
        for (const [k, v] of Object.entries(data)) {
            stringifiedData[k] = String(v);
        }
        stringifiedData.title = String(title);
        stringifiedData.body = String(body);

        const message = {
            token: student.fcmToken,
            notification: {
                title,
                body,
            },
            data: stringifiedData,
            android: {
                priority: "high",
                notification: {
                    channelId: "library_desk_channel",
                    sound: "default",
                    priority: "max",
                    defaultVibrateTimings: true,
                },
            },
        };

        const response = await messaging.send(message);
        console.log(`[PushNotification] Sent to ${student.name} (${studentId}):`, response);
        return { success: true, messageId: response };
    } catch (error) {
        console.error(`[PushNotification] Error sending to student ${studentId}:`, error?.message || error);
        if (
            error?.code === "messaging/registration-token-not-registered" ||
            error?.code === "messaging/invalid-registration-token"
        ) {
            await studentModel.findByIdAndUpdate(studentId, { fcmToken: null, fcmTokenUpdatedAt: null });
            console.log(`[PushNotification] Cleared invalid FCM token for student ${studentId}`);
        }
        return { success: false, error: error?.message };
    }
};

/**
 * Send broadcast push notification to multiple students in a library
 * @param {Object} params
 * @param {string} params.libraryId - Library ID
 * @param {string} params.title - Notice title
 * @param {string} params.body - Notice body
 * @param {Object} [params.data] - Custom data
 */
export const sendBroadcastToLibraryStudents = async ({ libraryId, title, body, data = {} }) => {
    try {
        const now = new Date();
        const students = await studentModel.find({
            libraryId,
            status: "active",
            currentExpireDate: { $gte: now },
            fcmToken: { $exists: true, $ne: null },
        }).select("fcmToken name");

        if (!students.length) {
            console.log(`[PushNotification] No active students with FCM tokens in library ${libraryId}`);
            return { success: true, count: 0 };
        }

        const messaging = getFirebaseMessaging();
        if (!messaging) return { success: false, reason: "FIREBASE_NOT_INITIALIZED" };

        const tokens = [
            ...new Set(
                students
                    .map((s) => s.fcmToken)
                    .filter((t) => t && typeof t === "string" && t.trim().length > 10)
            ),
        ];

        const stringifiedData = {};
        for (const [k, v] of Object.entries(data)) {
            stringifiedData[k] = String(v);
        }
        stringifiedData.title = String(title);
        stringifiedData.body = String(body);

        const response = await messaging.sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: stringifiedData,
            android: {
                priority: "high",
                notification: {
                    channelId: "library_desk_channel",
                    sound: "default",
                    priority: "max",
                },
            },
        });

        console.log(`[PushNotification] Broadcast sent to ${response.successCount}/${tokens.length} students in library ${libraryId}`);
        return { success: true, successCount: response.successCount, failureCount: response.failureCount };
    } catch (error) {
        console.error("[PushNotification] Error sending broadcast:", error);
        return { success: false, error: error?.message };
    }
};

/**
 * Send role-based notification (Owner vs Receptionist)
 * Saves to unified noticeModel and dispatches FCM push notification
 */
export const sendRoleNotification = async ({
    libraryId,
    targetRole = "admin", // 'admin' or 'reception'
    performedByRole = "admin",
    category = "ALERT",
    title,
    message,
    data = {},
}) => {
    try {
        if (!libraryId) return { success: false, reason: "MISSING_LIBRARY_ID" };

        // 1. Find Library and Owner
        const library = await libraryModel.findById(libraryId).select("ownerId libraryName").lean();
        if (!library) {
            console.warn(`[RoleNotification] Library ${libraryId} not found.`);
            return { success: false, reason: "LIBRARY_NOT_FOUND" };
        }

        const ownerId = library.ownerId;
        const owner = await userModel.findById(ownerId).select("deviceTokens").lean();

        // 2. Persist notification in unified noticeModel
        const record = await noticeModel.create({
            libraryId,
            recipientRole: targetRole,
            performedByRole,
            category,
            title,
            message,
            data,
            durationDays: 15,
            expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Auto-purged after 15 days
            isRead: false,
        });

        // 3. Find device tokens matching targetRole
        const ownerTokens = owner?.deviceTokens || [];
        console.log(`[RoleNotification] Owner ${ownerId} has ${ownerTokens.length} total device tokens:`, ownerTokens.map((t) => ({ role: t.role, token: t.fcmToken ? `${t.fcmToken.substring(0, 10)}...` : null })));

        const tokens = ownerTokens
            .filter((d) => (d.role === targetRole || (targetRole === "admin" && !d.role)) && d.fcmToken && d.fcmToken.trim().length > 10)
            .map((d) => d.fcmToken.trim());

        const uniqueTokens = [...new Set(tokens)];

        if (!uniqueTokens.length) {
            console.log(`[RoleNotification] Stored alert ${record._id}, but no active FCM tokens found for role ${targetRole}`);
            return { success: true, recordId: record._id, pushSent: false };
        }

        const messaging = getFirebaseMessaging();
        if (!messaging) return { success: true, recordId: record._id, pushSent: false };

        const stringifiedData = {};
        for (const [k, v] of Object.entries(data)) {
            stringifiedData[k] = String(v);
        }
        stringifiedData.title = String(title);
        stringifiedData.body = String(message);
        stringifiedData.type = String(category);
        stringifiedData.notificationId = String(record._id);

        const response = await messaging.sendEachForMulticast({
            tokens: uniqueTokens,
            notification: { title, body: message },
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

        console.log(`[RoleNotification] Alert pushed to ${response.successCount}/${uniqueTokens.length} devices for role ${targetRole}`);
        return { success: true, recordId: record._id, pushSent: true };
    } catch (error) {
        console.error("[RoleNotification] Error sending role notification:", error);
        return { success: false, error: error?.message };
    }
};
