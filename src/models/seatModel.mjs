import mongoose from "mongoose";

const SeatSchema = new mongoose.Schema(
    {
        libraryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Library",
            required: true,
            index: true,
        },
        seatNumber: {
            type: Number,
            required: true,
        },
        label: {
            type: String, // optional friendly name e.g. "A1", "Window-3"
            default: null,
        },
        status: {
            type: String,
            enum: ["active", "disabled", "maintenance"],
            default: "active",
        },
    },
    { timestamps: true }
);

// Prevent duplicate seat numbers within the same library
SeatSchema.index({ libraryId: 1, seatNumber: 1 }, { unique: true });

const seatModel = mongoose.model("Seat", SeatSchema);

export { seatModel };
