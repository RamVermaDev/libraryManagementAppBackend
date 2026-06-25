import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
            maxlength: 100,
            match: [
                /^[A-Za-z\s.'-]+$/,
                "Name can only contain letters, spaces, apostrophes, periods and hyphens"
            ]
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                "Please enter a valid email address"
            ]
        },

        password: {
            type: String,
            required: true,
            select: false,
            
        },

        isEmailVerified: {
            type: Boolean,
            default: false,
        },

        emailVerifiedAt: {
            type: Date,
            default: null,
        },

        role: {
            type: String,
            enum: ["admin", "librarian", "staff", "user"],
            default: "user",
        },

        status: {
            type: String,
            enum: ["active", "inactive", "blocked", "suspended"],
            default: "active",
        },

        libraries: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Library"
            }
        ],

        subscription: {
            plan: {
                type: String,
                default: "free",
            },

            status: {
                type: String,
                enum: ["active", "expired", "cancelled", "trial"],
                default: "trial",
            },

            startAt: {
                type: Date,
                default: null
            },

            endAt: {
                type: Date,
                default: null
            },

            paymentId: String,

            paymentProvider: String,

            amount: Number,

            currency: {
                type: String,
                default: "INR",
            },

            autoRenew: {
                type: Boolean,
                default: false,
            },
        },

        lastLoginAt: {
            type: Date,
            default: null
        },

        lastLoginIP: {
            type: String,
            default: null
        },

        lastDevice: {
            type: String,
            default: null
        },

        refreshToken: {
            type: String,
            select: false,
        },

        passwordChangedAt: {
            type: Date,
            default: null
        },

        failedLoginAttempts: {
            type: Number,
            default: 0,
        },

        accountLockedUntil: {
            type: Date,
            default: null
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },

        deletedAt: {
            type: Date,
            default: null
        },
    },
    {
        timestamps: true,
    },
)

const userModel = mongoose.model("User", userSchema)

export { userModel } 
