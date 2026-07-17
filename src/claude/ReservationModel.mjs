import mongoose from "mongoose";

const reservationSchema = new mongoose.Schema({

    // Core relationships

    libraryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Library",
        required: true,
        index: true
    },

    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true,
        index: true
    },

    slotTemplateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SlotTemplate",
        required: true
    },

    // Physical seat. Null means "not yet assigned" (overbooked / pending).

    seatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Seat",
        default: null,
        index: true
    },

    // Time window COPIED from the slot template at booking time.
    // If the owner edits the template later, existing bookings must not shift.

    startMinute: {
        type: Number,
        required: true
    },

    endMinute: {
        type: Number,
        required: true
    },

    // Subscription validity window (date-only, no time component)

    subscriptionStartDate: {
        type: Date,
        required: true
    },

    subscriptionExpiryDate: {
        type: Date,
        required: true
    },

    // Lifecycle status

    status: {
        type: String,
        enum: [
            "active",             // valid, counts toward occupancy
            "cancelled",          // owner/student cancelled
            "expired_archived",   // housekeeping only, never relied on for correctness
            "overbooked_pending"  // no physical seat was free at booking time
        ],
        default: "active",
        index: true
    },

    // True if this reservation was created when capacity was already exceeded

    overbooked: {
        type: Boolean,
        default: false
    },

    // Audit chain - links to the reservation this one replaced

    renewalOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reservation",
        default: null
    },

    editedFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reservation",
        default: null
    },

    cancelledAt: {
        type: Date,
        default: null
    },

    // Optimistic concurrency control for safe concurrent edits

    version: {
        type: Number,
        default: 0
    }

},
    {
        timestamps: true
    });

// The single most important index in the whole system.
// Backs the "which reservations are active on date D" query used by
// both slot-availability and seat-assignment.
reservationSchema.index({
    libraryId: 1,
    status: 1,
    subscriptionExpiryDate: 1,
    subscriptionStartDate: 1
});

// Backs seat-conflict checking during seat assignment
reservationSchema.index({
    seatId: 1,
    subscriptionStartDate: 1,
    subscriptionExpiryDate: 1
});

// Backs "my bookings" for a student
reservationSchema.index({ studentId: 1, status: 1 });

// Backs the owner's "unassigned / overbooked" queue
reservationSchema.index(
    { libraryId: 1, status: 1 },
    { partialFilterExpression: { status: "overbooked_pending" } }
);

const reservationModel = mongoose.model(
    "Reservation",
    reservationSchema
);

export { reservationModel };
