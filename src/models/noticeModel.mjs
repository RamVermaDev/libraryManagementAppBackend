import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
    {
        libraryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Library",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 800,
        },
        durationDays: {
            type: Number,
            default: 3,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 }, // MongoDB TTL: automatically drops document at expiresAt
        },
        recipientRole: {
            type: String,
            enum: ["student", "admin", "reception", "all"],
            default: "student",
            index: true,
        },
        performedByRole: {
            type: String,
            default: "admin",
        },
        category: {
            type: String,
            default: "ANNOUNCEMENT", // "ANNOUNCEMENT", "ADMISSION", "RENEWAL", "BOOK_ISSUE", "EXPENSE", "TASK", "TASK_COMPLETED"
        },
        data: {
            type: Object,
            default: {},
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);

export const noticeModel = mongoose.model("Notice", noticeSchema);
