import mongoose from "mongoose";

const feeRecordSchema = new mongoose.Schema(
    {
        // RELATIONSHIPS

        library: {
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

        plan: {
            type: String,
            required: true,
        },
        //this will be done later
        // plan: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "Plan",
        //     required: true,
        // },

        // PROGRAM DETAILS
        programDays: {
            type: Number,
            required: true,
            min: 1,
        },

        startDate: {
            type: Date,
            required: true,
        },

        expireDate: {
            type: Date,
            required: true,
        },

        // FEE DETAILS
        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        discount: {
            type: Number,
            default: 0,
            min: 0,
        },

        finalAmount: {
            type: Number,
            required: true,
            min: 0,
        },

        paidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        pendingAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);


// Fast student fee-history query
feeRecordSchema.index({
    library: 1,
    student: 1,
    startDate: -1,
});


// Fast pending-fee query
feeRecordSchema.index({
    library: 1,
    pendingAmount: 1,
});


const feeRecordModel = mongoose.model("FeeRecord", feeRecordSchema);

export { feeRecordModel };