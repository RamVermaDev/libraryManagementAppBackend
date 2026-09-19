import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, "../../serviceAccountKey.json");

let isInitialized = false;

export const initFirebaseAdmin = () => {
    if (isInitialized || getApps().length > 0) {
        isInitialized = true;
        return;
    }

    try {
        if (!fs.existsSync(serviceAccountPath)) {
            console.warn("⚠️ Firebase Admin: serviceAccountKey.json not found at", serviceAccountPath);
            return null;
        }

        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

        initializeApp({
            credential: cert(serviceAccount),
        });

        isInitialized = true;
        console.log("✅ Firebase Admin initialized successfully.");
    } catch (error) {
        console.error("❌ Failed to initialize Firebase Admin:", error);
    }
};

export const getFirebaseMessaging = () => {
    if (!isInitialized) {
        initFirebaseAdmin();
    }
    return getApps().length > 0 ? getMessaging() : null;
};
