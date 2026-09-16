import mongoose from "mongoose";

const { Schema, model } = mongoose;

const bookIssueSchema = new Schema(
    {
        libraryId: {
            type: Schema.Types.ObjectId,
            ref: "Library",
            required: [true, "Library ID is required"],
            index: true,
        },

        bookId: {
            type: Schema.Types.ObjectId,
            ref: "Book",
            required: [true, "Book ID is required"],
            index: true,
        },

        studentId: {
            type: Schema.Types.ObjectId,
            ref: "Student",
            required: [true, "Student ID is required"],
            index: true,
        },

        issueDate: {
            type: Date,
            default: Date.now,
            required: true,
        },

        dueDate: {
            type: Date,
            default: null, // null if no limit
        },

        returnDate: {
            type: Date,
            default: null, // null until returned
        },

        rentPrice: {
            type: Number,
            min: [0, "Rent price cannot be negative"],
            default: 0,
        },

        status: {
            type: String,
            enum: {
                values: ["issued", "returned"],
                message: "{VALUE} is not a valid issue status",
            },
            default: "issued",
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

bookIssueSchema.index({ libraryId: 1, status: 1 });
bookIssueSchema.index({ libraryId: 1, studentId: 1, status: 1 });
bookIssueSchema.index({ libraryId: 1, bookId: 1, status: 1 });

const bookIssueModel = model("BookIssue", bookIssueSchema);

export { bookIssueModel };
