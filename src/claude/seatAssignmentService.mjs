import { seatModel } from "../models/seatModel.mjs";
import { reservationModel } from "./ReservationModel.mjs";


/**
 * Two reservations conflict for shared-seat purposes only if BOTH are true:
 * c:\Users\ramve\Downloads\seatAssignmentService_1.mjs  1. Their subscription date ranges overlap
 *   2. Their daily time windows overlap
 * (This function is used to filter within one seat's own small reservation list.)
 */
function timeWindowsOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

/**
 * Find a physical seat that is free for the ENTIRE subscription period of
 * a new reservation - not just "today", every date in its range, at its
 * specific daily time window.
 *
 * @param {String} libraryId
 * @param {Object} newRes  { startMinute, endMinute, subscriptionStartDate, subscriptionExpiryDate }
 * @param {String} [preferredSeatId]  try this seat first (e.g. renewals - keep the same seat)
 * @returns {String|null}  seatId if a free seat was found, otherwise null
 */
async function assignSeat(libraryId, newRes, preferredSeatId = null) {
    const { startMinute, endMinute, subscriptionStartDate, subscriptionExpiryDate } = newRes;

    // Step 1: pull only reservations that could possibly conflict.
    // Date-range overlap is a cheap, indexed, coarse filter applied first -
    // this keeps the list small even in a library with thousands of historical bookings.
    const candidates = await reservationModel
        .find({
            libraryId,
            status: { $in: ["active", "overbooked_pending"] },
            seatId: { $ne: null },
            subscriptionStartDate: { $lte: subscriptionExpiryDate },
            subscriptionExpiryDate: { $gte: subscriptionStartDate }
        })
        .select("seatId startMinute endMinute")
        .lean();

    // Step 2: group the (small) candidate list by seat, so each seat only
    // has to check overlap against ITS OWN existing bookings, not everyone's.
    const busyBySeat = new Map();
    for (const r of candidates) {
        const key = String(r.seatId);
        if (!busyBySeat.has(key)) busyBySeat.set(key, []);
        busyBySeat.get(key).push(r);
    }

    const conflictsWithSeat = (seatId) => {
        const busyList = busyBySeat.get(String(seatId)) || [];
        return busyList.some((r) => timeWindowsOverlap(startMinute, endMinute, r.startMinute, r.endMinute));
    };

    // Step 3: try the preferred seat first (renewals keep the same seat if still free).
    if (preferredSeatId && !conflictsWithSeat(preferredSeatId)) {
        const stillActive = await seatModel.exists({ _id: preferredSeatId, status: "active" });
        if (stillActive) return preferredSeatId;
    }

    // Step 4: greedy first-fit across all active seats, in stable seatNumber order.
    // This is the classic interval-partitioning algorithm - greedy first-fit
    // is provably optimal for this problem, so if this loop finds nothing,
    // capacity is genuinely exhausted, not a bug in the search.
    const allSeats = await seatModel
        .find({ libraryId, status: "active" })
        .sort({ seatNumber: 1 })
        .select("_id")
        .lean();

    for (const seat of allSeats) {
        if (!conflictsWithSeat(seat._id)) {
            return seat._id;
        }
    }

    // No seat is free for the whole window -> genuine overbooking.
    return null;
}

export { assignSeat };
