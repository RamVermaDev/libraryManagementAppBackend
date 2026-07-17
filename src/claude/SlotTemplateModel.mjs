import mongoose from "mongoose";

const slotTemplateSchema = new mongoose.Schema({

    // Owning library

    libraryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Library",
        required: true,
        index: true
    },

    // Display name

    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },

    monthlyPrice: {
      type: Number,
      required: true,
      min: 0,
    },


    // Time window, stored as minutes-from-library-midnight
    // e.g. 6:00 AM = 360, 12:00 PM = 720
    // NOTE: endMinute can exceed 1440 for overnight slots (10PM-4AM = 1320 to 1680)

    startMinute: {
        type: Number,
        required: true,
        min: 0
    },

    endMinute: {
        type: Number,
        required: true
    },

    // Whether owner has this template currently open for booking

    isActive: {
        type: Boolean,
        default: true
    }

},
    {
        timestamps: true
    });

// endMinute must always be after startMinute
slotTemplateSchema.pre("validate", function () {
    if (this.endMinute <= this.startMinute) {
        return next(new Error("endMinute must be greater than startMinute"));
    }
});

slotTemplateSchema.index({ libraryId: 1, isActive: 1 });

const slotTemplateModel = mongoose.model(
    "SlotTemplate",
    slotTemplateSchema
);

export { slotTemplateModel };
