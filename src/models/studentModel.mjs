import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
    {
        // OWNERSHIP
        libraryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Library",
            required: true,
            index: true,
        },

        slotTemplateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SlotTemplate",
            required: true,
        },

        seatId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seat",
            default: null,
        },

        // PERSONAL DETAILS
        name: {
            type: String,
            required: [true, "Student name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [100, "Name cannot exceed 100 characters"],
        },

        phone: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true,
            match: [/^[6-9]\d{9}$/, "Enter a valid Indian phone number"],
        },

        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
            default: null,
        },

        idProof: {
            type: String,
            trim: true,
            default: null,
        },

        photoPublicId: {
            type: String,
            default: "",
        },

        // MEMBERSHIP SUMMARY
        joiningDate: {
            type: Date,
            required: true,
            default: Date.now,
        },


        //this will also change but right wo okay!!!!!!
        currentPlanDays: {
            type: Number,
            min: 1,
            default: null,
        },

        currentStartDate: {
            type: Date,
            default: null,
        },

        currentExpireDate: {
            type: Date,
            default: null,
            index: true,
        },

        // FINANCIAL SUMMARY
        totalPaid: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalPending: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalDiscount: {
            type: Number,
            default: 0,
            min: 0,
        },

        lastPaymentDate: {
            type: Date,
            default: null,
        },

        // OTHER
        notes: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);



// Same phone cannot be added twice in one library
studentSchema.index(
    { libraryId: 1, phone: 1 },
    { unique: true }
);


// Fast query for students expiring soon
studentSchema.index({
    libraryId: 1,
    currentExpireDate: 1,
});


const studentModel = mongoose.model("Student", studentSchema);

export { studentModel };