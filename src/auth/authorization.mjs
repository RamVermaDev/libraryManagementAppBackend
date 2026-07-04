import jwt from "jsonwebtoken";
import { userModel } from "../models/userModel.mjs";
import { JWT_SECRET } from "../../config.mjs";

export const authenticate = async (req, res, next) => {

    try {
        console.log('auth')

        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        const user = await userModel
            .findById(decoded.userId)
            .select("-password -refreshToken");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.isDeleted) {
            return res.status(403).json({
                success: false,
                message: "Account deleted."
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                success: false,
                message: `Account is ${user.status}.`
            });
        }

        req.user = user;

        next();

    } catch (error) {
        console.error("Authentication Error:", error);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired token."
        });

    }

};