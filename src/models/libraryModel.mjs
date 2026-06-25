import mongoose from "mongoose";

const librarySchema = new mongoose.Schema({

    // Owner

    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    // Basic Information

    libraryName: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 100
    },

    tagLine: {
        type: String,
        trim: true,
        maxlength: 150,
        default: ""
    },

    whatsappNumber: {
        type: String,
        required: true,
        match: /^[6-9]\d{9}$/
    },

    // Address

    city: {
        type: String,
        required: true,
        trim: true
    },

    state: {
        type: String,
        required: true,
        trim: true
    },

    pinCode: {
        type: String,
        required: true,
        match: /^\d{6}$/
    },

    // Status

    status: {
        type: String,
        enum: [
            "active",
            "inactive",
            "blocked"
        ],
        default: "active"
    },

    // Statistics

    totalStudents: {
        type: Number,
        default: 0
    },

    totalSeats: {
        type: Number,
        default: 0
    },

    availableSeats: {
        type: Number,
        default: 0
    },

    // Subscription

    subscription: {

        plan: {
            type: String,
            enum: [
                "free",
                "basic",
                "premium"
            ],
            default: "free"
        },

        status: {
            type: String,
            enum: [
                "active",
                "expired"
            ],
            default: "active"
        },

        startAt: Date,

        endAt: Date

    },

    // Settings

    settings: {

        allowOnlineAdmission: {
            type: Boolean,
            default: false
        },

        showWhatsapp: {
            type: Boolean,
            default: true
        }

    },

    // Soft Delete

    isDeleted: {
        type: Boolean,
        default: false
    },

    deletedAt: {
        type: Date,
        default: null
    }

},
    {
        timestamps: true
    });

const libraryModel = mongoose.model(
    "Library",
    librarySchema
);

export { libraryModel }