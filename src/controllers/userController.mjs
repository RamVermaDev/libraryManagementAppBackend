import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken'
import { userModel } from "../models/userModel.mjs";
import { BCRYPT_SALT_ROUND, JWT_SECRET } from "../../config.mjs";

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

        const user = await userModel.create({
            name,
            email,
            password: hashedPassword
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

        user.lastLoginAt = new Date();
        user.lastLoginIP = req.ip;
        user.lastDevice = req.get("User-Agent");

        await user.save();

        // Response

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isEmailVerified: user.isEmailVerified,
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

export { signupUser, loginUser }