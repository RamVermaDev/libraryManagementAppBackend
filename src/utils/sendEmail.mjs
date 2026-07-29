import nodemailer from "nodemailer";
import { SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from "../../config.mjs";

// const transporter = nodemailer.createTransport({
//     host: SMTP_HOST,
//     port: Number(SMTP_PORT),
//     secure: false, // Port 587 uses STARTTLS
//     auth: {
//         user: SMTP_USER,
//         pass: SMTP_PASS,
//     },
//     family: 4, // Use IPv4
// });


const port = Number(SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: port,
    secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
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