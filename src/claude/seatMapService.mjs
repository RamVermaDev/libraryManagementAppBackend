import { seatModel } from "../models/seatModel.mjs";
import { reservationModel } from "./ReservationModel.mjs";
import { slotTemplateModel } from "./SlotTemplateModel.mjs";

function normalizeDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Returns EVERY seat in the library, each tagged "booked" or "available",
 * for a specific slot template on a specific date.
 *
 * This is what powers the seat-picker screen: owner selects a slot,
 * this shows which physical seats are free to click, and which are
 * already taken (with who's sitting there).
 *
 * A seat counts as "booked" for this slot if ANY active reservation on
 * that seat has a time window overlapping the requested slot - not just
 * reservations booked under this exact slot template. This keeps it
 * consistent with the availability engine (e.g. an overlapping Office
 * slot booking correctly shows that seat as booked on the Morning
 * seat-picker too).
 *
 * @param {String} libraryId
 * @param {String} slotTemplateId
 * @param {Date} [date]  defaults to today
 */
async function getSeatMap(libraryId, slotTemplateId, date = new Date()) {
    const targetDate = normalizeDate(date);

    const slotTemplate = await slotTemplateModel.findOne({ _id: slotTemplateId, libraryId }).lean();
    if (!slotTemplate) {
        throw new Error("Slot template not found for this library");
    }
    const { startMinute, endMinute } = slotTemplate;

    const [allSeats, activeReservations] = await Promise.all([
        seatModel.find({ libraryId, status: "active" }).sort({ seatNumber: 1 }).lean(),

        reservationModel
            .find({
                libraryId,
                // both statuses count as "occupying" IF they have a seatId -
                // overbooked_pending reservations have seatId: null, so they
                // never show up as blocking a seat here, only in the
                // capacity count on the availability screen.
                status: { $in: ["active", "overbooked_pending"] },
                seatId: { $ne: null },
                subscriptionStartDate: { $lte: targetDate },
                subscriptionExpiryDate: { $gte: targetDate },
                // time-window overlap with the requested slot, filtered
                // directly in the query
                startMinute: { $lt: endMinute },
                endMinute: { $gt: startMinute }
            })
            .select("seatId studentId startMinute endMinute")
            .populate("studentId", "name")
            .lean()
    ]);

    const occupiedBySeat = new Map();
    for (const r of activeReservations) {
        occupiedBySeat.set(String(r.seatId), r);
    }

    return allSeats.map((seat) => {
        const occupyingReservation = occupiedBySeat.get(String(seat._id));

        return {
            seatId: seat._id,
            seatNumber: seat.seatNumber,
            label: seat.label,
            status: occupyingReservation ? "booked" : "available",
            bookedBy: occupyingReservation
                ? {
                      studentId: occupyingReservation.studentId?._id ?? occupyingReservation.studentId,
                      studentName: occupyingReservation.studentId?.name ?? null,
                      reservationId: occupyingReservation._id
                  }
                : null
        };
    });
}

export { getSeatMap };
