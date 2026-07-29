import nodemailer from "nodemailer";
import { SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from "../../config.mjs";

const port = Number(SMTP_PORT) || 587;

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: port,
    secure: port === 465, // true for 465, false for 587 / 25
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
    connectionTimeout: 10000, // 10s connection timeout
    greetingTimeout: 10000,
    socketTimeout: 10000,
});


const sendEmail = async ({ to, subject, text, html }) => {
    try {
        console.log("SMTP_FROM =", SMTP_FROM);
        console.log("typeof SMTP_FROM =", typeof SMTP_FROM);
        const info = await transporter.sendMail({
            from: SMTP_FROM,
            to,
            subject,
            text,
            html,
        });

        console.log("✅ Email sent:", info.messageId);

        return info;
    } catch (error) {
        console.error("❌ Email sending failed:", error);
        throw error;
    }
};

export default sendEmail;