import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        // RELATIONSHIPS

        libraryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Library",
            required: true,
            index: true,
        },

        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
            index: true,
        },

        feeRecord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FeeRecord",
            required: true,
            index: true,
        },

        // PAYMENT DETAILS

        amount: {
            type: Number,
            required: true,
            min: 1,
        },

        paymentMode: {
            type: String,
            required: true,
            enum: [
                "Cash",
                "Online",
            ],
        },

        paymentDate: {
            type: Date,
            default: Date.now,
        },

        // Optional reference from UPI/bank/card payment
        transactionReference: {
            type: String,
            trim: true,
            default: null,
        },

        // Optional note by library owner
        note: {
            type: String,
            trim: true,
            maxlength: 300,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);


// Student payment history
paymentSchema.index({
    libraryId: 1,
    student: 1,
    paymentDate: -1,
});


// Payments of one FeeRecord
paymentSchema.index({
    feeRecord: 1,
    paymentDate: -1,
});


// Library income history
paymentSchema.index({
    libraryId: 1,
    paymentDate: -1,
});


const paymentModel = mongoose.model("Payment", paymentSchema);

export { paymentModel };