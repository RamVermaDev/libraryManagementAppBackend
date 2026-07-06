import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
    {
        // OWNERSHIP
        library: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Library",
            required: true,
            index: true,
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

        //REMOVING GENDER FOR NOW
        // gender: {
        //     type: String,
        //     enum: ["Male", "Female", "Other"],
        //     default: null,
        // },

        idProof: {
            type: String,
            trim: true,
            default: null,
        },

        //will do tit later 
        // profileImage: {
        //     type: String,
        //     default: null,
        // },

        // MEMBERSHIP SUMMARY
        joiningDate: {
            type: Date,
            required: true,
            default: Date.now,
        },


        //sample Plan
        currentPlan: {
            type: String,
            required: true,
        },


        //will do it later
        // currentPlan: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "Plan",
        //     default: null,
        // },


        //this will also change but right wo okay!!!!!!
        currentProgramDays: {
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
    { library: 1, phone: 1 },
    { unique: true }
);


// Fast query for students expiring soon
studentSchema.index({
    library: 1,
    currentExpireDate: 1,
});


const studentModel = mongoose.model("Student", studentSchema);

export { studentModel };