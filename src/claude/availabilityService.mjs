import { reservationModel } from "./ReservationModel.mjs";
import { getActiveSeatCount } from "./seatService.mjs";
import { slotTemplateModel } from "./SlotTemplateModel.mjs";


// Bucket size in minutes. Smaller = more precise, bigger array. 5 is a good default.
const GRANULARITY = 5;

/**
 * Build a per-minute-bucket occupancy count across the whole day using a
 * difference array (classic range-increment technique). This is what lets
 * us handle ANY number of overlapping custom slot templates in one pass,
 * instead of running a separate overlap check per template.
 *
 * @param {Array} reservations  each item needs { startMinute, endMinute }
 * @param {Number} totalBuckets how many buckets the timeline needs
 */
function buildOccupancyTimeline(reservations, totalBuckets, granularity = GRANULARITY) {
    const diff = new Int16Array(totalBuckets + 1);

    for (const r of reservations) {
        const startBucket = Math.floor(r.startMinute / granularity);
        const endBucket = Math.min(Math.ceil(r.endMinute / granularity), totalBuckets);
        diff[startBucket]++;
        diff[endBucket]--;
    }

    // prefix sum -> running concurrency at every bucket
    const occupancy = new Int16Array(totalBuckets);
    let running = 0;
    for (let i = 0; i < totalBuckets; i++) {
        running += diff[i];
        occupancy[i] = running;
    }
    return occupancy;
}

/**
 * Peak concurrent reservations within [startMinute, endMinute) -
 * this is the number that determines a slot template's "seats used".
 */
function maxOccupancyInRange(occupancy, startMinute, endMinute, granularity = GRANULARITY) {
    const from = Math.floor(startMinute / granularity);
    const to = Math.min(Math.ceil(endMinute / granularity), occupancy.length);

    let max = 0;
    for (let i = from; i < to; i++) {
        if (occupancy[i] > max) max = occupancy[i];
    }
    return max;
}

/**
 * Normalize any date/time input down to a clean midnight Date object,
 * so date comparisons in the DB query are always apples-to-apples.
 */
function normalizeDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * THE main function. For a given library and date, returns every active
 * slot template along with its live availability - no stored counters,
 * fully derived from current active reservations.
 *
 * @param {String} libraryId
 * @param {Date} [date]  defaults to today
 */
async function getSlotAvailability(libraryId, date = new Date()) {
    const targetDate = normalizeDate(date);

    const [activeReservations, slotTemplates, totalSeats] = await Promise.all([
        // Only reservations valid on this exact date are pulled -
        // expired/cancelled/future ones are excluded automatically here.
        // IMPORTANT: both "active" AND "overbooked_pending" count here -
        // an overbooked student still represents real demand against
        // capacity, even though they didn't get a physical seat. This is
        // what allows availableSeats to correctly go negative.
        reservationModel
            .find({
                libraryId,
                status: { $in: ["active", "overbooked_pending"] },
                subscriptionStartDate: { $lte: targetDate },
                subscriptionExpiryDate: { $gte: targetDate }
            })
            .select("startMinute endMinute")
            .lean(),

        slotTemplateModel.find({ libraryId, isActive: true }).lean(),

        getActiveSeatCount(libraryId)
    ]);

    if (slotTemplates.length === 0) {
        return [];
    }

    // Size the timeline to cover the latest endMinute across templates AND
    // any reservation (handles overnight slots that spill past 1440).
    const maxEndMinute = Math.max(
        1440,
        ...slotTemplates.map((t) => t.endMinute),
        ...activeReservations.map((r) => r.endMinute)
    );
    const totalBuckets = Math.ceil(maxEndMinute / GRANULARITY) + 1;

    const occupancy = buildOccupancyTimeline(activeReservations, totalBuckets);

    return slotTemplates.map((template) => {
        const usedSeats = maxOccupancyInRange(occupancy, template.startMinute, template.endMinute);
        const availableSeats = totalSeats - usedSeats;

        return {
            slotTemplateId: template._id,
            name: template.name,
            startMinute: template.startMinute,
            endMinute: template.endMinute,
            monthlyPrice: template.monthlyPrice,
            totalSeats,
            usedSeats,
            availableSeats,                 // can be negative -> overbooked
            isFull: availableSeats <= 0,
            extraSeatsNeededIfBookingOneMore: availableSeats <= 0 ? Math.abs(availableSeats) + 1 : 0
        };
    });
}

export { getSlotAvailability, buildOccupancyTimeline, maxOccupancyInRange };
