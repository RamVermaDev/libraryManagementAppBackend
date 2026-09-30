import mongoose from "mongoose";

const appVersionSchema = new mongoose.Schema(
    {
        latestVersion: {
            type: String,
            required: true,
            default: "1.3.3",
        },
        minSupportedVersion: {
            type: String,
            default: "1.0.0",
        },
        forceUpdate: {
            type: Boolean,
            default: false,
        },
        releaseNotes: {
            type: [String],
            default: [
                "Custom Library Logo support",
                "Simplified Student Invoices (Paid & Pending)",
                "Performance optimizations & bug fixes",
            ],
        },
        downloadUrl: {
            type: String,
            default: "https://play.google.com/store/apps/details?id=com.librarydesk.app",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

export const appVersionModel = mongoose.model("AppVersion", appVersionSchema);
