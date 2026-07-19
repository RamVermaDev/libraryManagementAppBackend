import mongoose from "mongoose";
import { assignSeat } from "./seatAssignmentService.mjs";
import { slotTemplateModel } from "./SlotTemplateModel.mjs";
import { reservationModel } from "./ReservationModel.mjs";
import { getSlotAvailability } from "./availabilityService.mjs";

/**
 * Create a new reservation. NEVER blocks on capacity - if no physical seat
 * is free for the whole subscription window, the reservation is still
 * created (status: "overbooked_pending", seatId: null) and an overbooking
 * warning is returned for the owner to see.
 *
 * @param {Object} data
 * @param {String} data.libraryId
 * @param {String} data.studentId
 * @param {String} data.slotTemplateId
 * @param {Date}   data.subscriptionStartDate
 * @param {Date}   data.subscriptionExpiryDate
 */
async function createReservationForLibrary(data) {
    const { libraryId, studentId, slotTemplateId, subscriptionStartDate, subscriptionExpiryDate } = data;

    if (new Date(subscriptionExpiryDate) < new Date(subscriptionStartDate)) {
        throw new Error("subscriptionExpiryDate cannot be before subscriptionStartDate");
    }

    // Time window is COPIED from the slot template now, at booking time -
    // if the owner edits the template's timing later, this booking won't shift.
    const slotTemplate = await slotTemplateModel.findOne({ _id: slotTemplateId, libraryId }).lean();
    if (!slotTemplate) {
        throw new Error("Slot template not found for this library");
    }

    const { startMinute, endMinute } = slotTemplate;

    const seatId = await assignSeat(libraryId, {
        startMinute,
        endMinute,
        subscriptionStartDate,
        subscriptionExpiryDate
    });

    const overbooked = seatId === null;

    const reservation = await reservationModel.create({
        libraryId,
        studentId,
        slotTemplateId,
        seatId,
        startMinute,
        endMinute,
        subscriptionStartDate,
        subscriptionExpiryDate,
        status: overbooked ? "overbooked_pending" : "active",
        overbooked
    });

    let overbookingWarning = null;
    if (overbooked) {
        const availabilityOnStartDate = await getSlotAvailability(libraryId, subscriptionStartDate);
        const matchingSlot = availabilityOnStartDate.find(
            (s) => String(s.slotTemplateId) === String(slotTemplateId)
        );
        const excess = matchingSlot ? matchingSlot.extraSeatsNeededIfBookingOneMore : 1;
        overbookingWarning = {
            message: `This booking exceeds library capacity by ${excess} seat(s).`,
            excessSeats: excess
        };
    }

    return { reservation, overbookingWarning };
}

/**
 * Cancel a reservation (soft delete - never hard-remove, keeps history intact).
 * This is what makes the seat/slot immediately available again -
 * no recalculation needed, the availability engine just won't see it
 * anymore since status != "active".
 */
async function cancelReservation(reservationId) {
    const reservation = await reservationModel.findOneAndUpdate(
        { _id: reservationId, status: { $in: ["active", "overbooked_pending"] } },
        { status: "cancelled", cancelledAt: new Date() },
        { new: true }
    );

    if (!reservation) {
        throw new Error("Reservation not found or already cancelled");
    }

    return reservation;
}

/**
 * Renew a reservation - creates a NEW reservation linked back to the old one
 * (renewalOf), rather than mutating the old one in place. This preserves an
 * immutable audit trail (billing history, seat-history analytics).
 *
 * Tries to keep the SAME physical seat first (better UX - student keeps
 * "their" seat), falling back to a fresh assignment if it's no longer free.
 *
 * @param {String} oldReservationId
 * @param {Date} newSubscriptionStartDate
 * @param {Date} newSubscriptionExpiryDate
 */
async function renewReservation(oldReservationId, newSubscriptionStartDate, newSubscriptionExpiryDate) {
    const oldReservation = await reservationModel.findById(oldReservationId).lean();
    if (!oldReservation) {
        throw new Error("Original reservation not found");
    }

    if (new Date(newSubscriptionExpiryDate) < new Date(newSubscriptionStartDate)) {
        throw new Error("subscriptionExpiryDate cannot be before subscriptionStartDate");
    }

    const { libraryId, studentId, slotTemplateId, startMinute, endMinute, seatId: oldSeatId } = oldReservation;

    // Try the student's existing seat first, then fall back to first-fit.
    const seatId = await assignSeat(
        libraryId,
        {
            startMinute,
            endMinute,
            subscriptionStartDate: newSubscriptionStartDate,
            subscriptionExpiryDate: newSubscriptionExpiryDate
        },
        oldSeatId
    );

    const overbooked = seatId === null;

    const newReservation = await reservationModel.create({
        libraryId,
        studentId,
        slotTemplateId,
        seatId,
        startMinute,
        endMinute,
        subscriptionStartDate: newSubscriptionStartDate,
        subscriptionExpiryDate: newSubscriptionExpiryDate,
        status: overbooked ? "overbooked_pending" : "active",
        overbooked,
        renewalOf: oldReservation._id
    });

    let overbookingWarning = null;
    if (overbooked) {
        const availability = await getSlotAvailability(libraryId, newSubscriptionStartDate);
        const matchingSlot = availability.find((s) => String(s.slotTemplateId) === String(slotTemplateId));
        const excess = matchingSlot ? matchingSlot.extraSeatsNeededIfBookingOneMore : 1;
        overbookingWarning = {
            message: `This renewal exceeds library capacity by ${excess} seat(s).`,
            excessSeats: excess
        };
    }

    return { reservation: newReservation, overbookingWarning };
}

/**
 * Edit a reservation (change slot template, time window, or dates).
 * Implemented as cancel-old + create-new inside a transaction - never
 * mutate a live reservation's time/date fields in place, since that would
 * silently invalidate whatever seat-conflict guarantees were true at the
 * original booking time.
 *
 * NOTE: requires MongoDB running as a replica set (transactions need it).
 * If you're on a single standalone instance in development, this will
 * throw - either enable a replica set or skip transactions locally.
 *
 * @param {String} reservationId
 * @param {Object} changes  any of: slotTemplateId, subscriptionStartDate, subscriptionExpiryDate
 */
async function editReservation(reservationId, changes) {
    const session = await mongoose.startSession();

    try {
        let result;

        await session.withTransaction(async () => {
            const oldReservation = await reservationModel.findById(reservationId).session(session);
            if (!oldReservation) {
                throw new Error("Reservation not found");
            }

            // Cancel the old one first
            oldReservation.status = "cancelled";
            oldReservation.cancelledAt = new Date();
            await oldReservation.save({ session });

            // Work out the new time window - either from a new slot template,
            // or keep the existing one if only dates are changing.
            let startMinute = oldReservation.startMinute;
            let endMinute = oldReservation.endMinute;
            let slotTemplateId = oldReservation.slotTemplateId;

            if (changes.slotTemplateId) {
                const newTemplate = await slotTemplateModel
                    .findOne({ _id: changes.slotTemplateId, libraryId: oldReservation.libraryId })
                    .session(session);
                if (!newTemplate) throw new Error("New slot template not found for this library");
                startMinute = newTemplate.startMinute;
                endMinute = newTemplate.endMinute;
                slotTemplateId = newTemplate._id;
            }

            const subscriptionStartDate = changes.subscriptionStartDate || oldReservation.subscriptionStartDate;
            const subscriptionExpiryDate = changes.subscriptionExpiryDate || oldReservation.subscriptionExpiryDate;

            if (new Date(subscriptionExpiryDate) < new Date(subscriptionStartDate)) {
                throw new Error("subscriptionExpiryDate cannot be before subscriptionStartDate");
            }

            // Re-validate seat availability against the NEW window from scratch -
            // try keeping the same seat first for continuity.
            const seatId = await assignSeat(
                oldReservation.libraryId,
                { startMinute, endMinute, subscriptionStartDate, subscriptionExpiryDate },
                oldReservation.seatId
            );
            const overbooked = seatId === null;

            const [created] = await reservationModel.create(
                [
                    {
                        libraryId: oldReservation.libraryId,
                        studentId: oldReservation.studentId,
                        slotTemplateId,
                        seatId,
                        startMinute,
                        endMinute,
                        subscriptionStartDate,
                        subscriptionExpiryDate,
                        status: overbooked ? "overbooked_pending" : "active",
                        overbooked,
                        editedFrom: oldReservation._id
                    }
                ],
                { session }
            );

            result = created;
        });

        return result;
    } finally {
        session.endSession();
    }
}

export { createReservationForLibrary, cancelReservation, renewReservation, editReservation };
