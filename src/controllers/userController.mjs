import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken'
import { userModel } from "../models/userModel.mjs";
import { BCRYPT_SALT_ROUND, JWT_SECRET, DEFAULT_TRIAL_DAYS, MONTHLY_PRICE, YEARLY_PRICE } from "../../config.mjs";
import sendEmail from "../utils/sendEmail.mjs";

const signupUser = async (req, res) => {
    try {
        let { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });
        }

        name = name.trim();
        email = email.trim().toLowerCase();

        const existingUser = await userModel.findOne({
            email,
            isDeleted: false
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered."
            });
        }

        const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUND)
        const hashedPassword = await bcrypt.hash(password, salt)
        // Create User

        // Calculate trial end date from server-controlled config
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + DEFAULT_TRIAL_DAYS);

        const user = await userModel.create({
            name,
            email,
            password: hashedPassword,
            subscription: {
                plan: 'trial',
                status: 'trial',
                startAt: new Date(),
                endAt: trialEndsAt,
            }
        });

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                isEmailVerified: user.isEmailVerified,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        // Duplicate Email Error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email already exists."
            });
        }

        console.error("Signup Error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again later."
        });
    }
};


const loginUser = async (req, res) => {

    try {
        let { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        email = email.trim().toLowerCase();

        const user = await userModel.findOne({
            email,
            isDeleted: false
        }).select("+password +refreshToken");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        // Check Status

        if (user.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is not active."
            });
        }

        // Compare Password

        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        // Generate JWT

        const accessToken = jwt.sign(
            {
                userId: user._id,
                email: user.email
            },
            JWT_SECRET,
        );

        // Update Login Information

        const isFirstLogin = user.lastLoginAt === null;

        user.lastLoginAt = new Date();
        user.lastLoginIP = req.ip;
        user.lastDevice = req.get("User-Agent");

        await user.save();

        // Response

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token: accessToken,
            isFirstLogin,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isEmailVerified: user.isEmailVerified,
                libraries: user.libraries,
                createdAt: user.createdAt,
                subscription: {
                    plan: user.subscription?.plan ?? 'trial',
                    status: user.subscription?.status ?? 'trial',
                    startAt: user.subscription?.startAt ?? null,
                    endAt: user.subscription?.endAt ?? null,
                }
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again later."
        });
    }
};

const getCurrentUser = async (req, res) => {
    try {

        return res.status(200).json({
            success: true,
            message: "User fetched successfully.",
            user: req.user,
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: "Something went wrong.",
        });

    }
};

const updateProfile = async (req, res) => {
    try {
        let { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "Name and email are required."
            });
        }

        name = name.trim();
        email = email.trim().toLowerCase();

        const existingUser = await userModel.findOne({
            email,
            isDeleted: false,
            _id: { $ne: req.user._id }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered."
            });
        }

        const isEmailChanged = req.user.email !== email;

        req.user.name = name;
        req.user.email = email;

        if (isEmailChanged) {
            req.user.isEmailVerified = false;
            req.user.emailVerifiedAt = null;
        }

        await req.user.save();

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                isEmailVerified: req.user.isEmailVerified,
                libraries: req.user.libraries,
                createdAt: req.user.createdAt,
                subscription: {
                    plan: req.user.subscription?.plan ?? 'trial',
                    status: req.user.subscription?.status ?? 'trial',
                    startAt: req.user.subscription?.startAt ?? null,
                    endAt: req.user.subscription?.endAt ?? null,
                }
            }
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Email already exists."
            });
        }

        console.error("Update Profile Error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again later."
        });
    }
};

const sendEmailVerificationOtp = async (req, res) => {
    try {

        const user = await userModel.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: "Email is already verified."
            });
        }

        // Generate OTP
        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // Save OTP
        user.emailVerificationOtp = otp;

        // 10 minutes expiry
        user.emailVerificationOtpExpires = new Date(
            Date.now() + 10 * 60 * 1000
        );

        await user.save();

        await sendEmail({
            to: user.email,
            subject: "Verify Your Email",
            html: `
                <h2>Library Pro</h2>

                <p>Hello ${user.name},</p>

                <p>Your Email Verification OTP is:</p>

                <h1 style="letter-spacing:8px">
                    ${otp}
                </h1>

                <p>
                    This OTP will expire in
                    <strong>10 minutes</strong>.
                </p>

                <p>
                    If you didn't request this,
                    please ignore this email.
                </p>
            `
        });

        return res.status(200).json({
            success: true,
            message: "Verification OTP sent successfully."
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error."
        });

    }
};

const verifyEmailOtp = async (req, res) => {
    try {

        const { otp } = req.body;

        // Check OTP is provided
        if (!otp) {
            return res.status(400).json({
                success: false,
                message: "OTP is required."
            });
        }

        // Get logged-in user
        const user = await userModel.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // Already verified
        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: "Email is already verified."
            });
        }

        // No OTP generated
        if (
            !user.emailVerificationOtp ||
            !user.emailVerificationOtpExpires
        ) {
            return res.status(400).json({
                success: false,
                message: "Please request a verification OTP first."
            });
        }

        // OTP Expired
        if (user.emailVerificationOtpExpires < new Date()) {

            user.emailVerificationOtp = undefined;
            user.emailVerificationOtpExpires = undefined;

            await user.save();

            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new OTP."
            });
        }

        // OTP Incorrect
        if (user.emailVerificationOtp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP."
            });
        }

        // Verify Email
        user.isEmailVerified = true;
        user.emailVerifiedAt = new Date();

        // Clear OTP
        user.emailVerificationOtp = undefined;
        user.emailVerificationOtpExpires = undefined;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Email verified successfully.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isEmailVerified: user.isEmailVerified,
                libraries: user.libraries
            }
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error."
        });

    }
}

const sendAdminModeOtp = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.emailVerificationOtp = otp;
        user.emailVerificationOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

        await user.save();

        await sendEmail({
            to: user.email,
            subject: "Admin Mode Authorization OTP",
            html: `
                <h2>Library Pro</h2>
                <p>Hello ${user.name},</p>
                <p>Your 6-digit OTP code to switch to Admin Mode is:</p>
                <h1 style="letter-spacing:8px">${otp}</h1>
                <p>This OTP will expire in <strong>10 minutes</strong>.</p>
            `
        });

        return res.status(200).json({
            success: true,
            message: `OTP sent to ${user.email}`,
        });
    } catch (error) {
        console.error("SEND ADMIN OTP ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to send Admin OTP" });
    }
};

const verifyAdminModeOtp = async (req, res) => {
    try {
        const user = req.user;
        const { otp } = req.body;

        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!otp || String(otp).trim().length !== 6) {
            return res.status(400).json({ success: false, message: "Invalid 6-digit OTP" });
        }

        if (!user.emailVerificationOtp || !user.emailVerificationOtpExpires) {
            return res.status(400).json({ success: false, message: "No active OTP request found" });
        }

        if (new Date() > new Date(user.emailVerificationOtpExpires)) {
            return res.status(400).json({ success: false, message: "OTP has expired. Please request a new OTP" });
        }

        if (user.emailVerificationOtp !== String(otp).trim()) {
            return res.status(400).json({ success: false, message: "Incorrect OTP code" });
        }

        user.emailVerificationOtp = undefined;
        user.emailVerificationOtpExpires = undefined;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Admin Mode authorized successfully",
        });
    } catch (error) {
        console.error("VERIFY ADMIN OTP ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to verify Admin OTP" });
    }
};

export { signupUser, loginUser, updateProfile, sendEmailVerificationOtp, verifyEmailOtp, getCurrentUser, sendAdminModeOtp, verifyAdminModeOtp, getSubscriptionStatus }

// GET /api/subscription/status
// Returns fresh subscription data + backend-controlled pricing
const getSubscriptionStatus = async (req, res) => {
    try {
        const user = await userModel.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const endAt = user.subscription?.endAt;
        const now = Date.now();
        const msRemaining = endAt ? new Date(endAt).getTime() - now : 0;
        const daysRemaining = msRemaining > 0
            ? Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
            : 0;

        return res.status(200).json({
            success: true,
            subscription: {
                plan: user.subscription?.plan ?? 'trial',
                status: user.subscription?.status ?? 'trial',
                startAt: user.subscription?.startAt ?? null,
                endAt: user.subscription?.endAt ?? null,
                daysRemaining,
            },
            config: {
                monthlyPrice: MONTHLY_PRICE,
                yearlyPrice: YEARLY_PRICE,
            },
        });

    } catch (error) {
        console.error('Get Subscription Status Error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
};
