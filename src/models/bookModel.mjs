import mongoose from "mongoose";

const { Schema, model } = mongoose;

const bookSchema = new Schema(
    {
        libraryId: {
            type: Schema.Types.ObjectId,
            ref: "Library",
            required: [true, "Library ID is required"],
            index: true,
        },

        name: {
            type: String,
            required: [true, "Book name is required"],
            trim: true,
            minlength: [2, "Book name must be at least 2 characters"],
            maxlength: [200, "Book name cannot exceed 200 characters"],
        },

        category: {
            type: String,
            trim: true,
            default: "General",
            maxlength: [50, "Category cannot exceed 50 characters"],
        },

        copies: {
            type: Number,
            required: [true, "Total copies is required"],
            min: [1, "Must have at least 1 copy"],
            default: 1,
        },

        availableCopies: {
            type: Number,
            required: [true, "Available copies is required"],
            min: [0, "Available copies cannot be negative"],
            default: 1,
        },

        rentPrice: {
            type: Number,
            min: [0, "Rent price cannot be negative"],
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

bookSchema.index({ libraryId: 1, name: 1 });
bookSchema.index({ libraryId: 1, category: 1 });
bookSchema.index({ libraryId: 1, availableCopies: 1 });

const bookModel = model("Book", bookSchema);

export { bookModel };
