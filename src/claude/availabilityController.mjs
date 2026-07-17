import { getSlotAvailability } from "../services/availabilityService.mjs";

/**
 * GET /libraries/:libraryId/slots/availability?date=2026-07-21
 * If no date is passed, defaults to today.
 *
 * This is the endpoint the owner's booking screen calls to render:
 *   Morning (6AM-12PM)  -> Available Seats: 12
 *   Office (8AM-2PM)    -> Available Seats: 3
 *   Evening (12PM-6PM)  -> Available Seats: 0, needs 1 extra
 */
async function getAvailability(req, res) {
    try {
        const { libraryId } = req.params;
        const date = req.query.date ? new Date(req.query.date) : new Date();

        if (isNaN(date.getTime())) {
            return res.status(400).json({ error: "Invalid date format" });
        }

        const availability = await getSlotAvailability(libraryId, date);

        res.status(200).json({
            libraryId,
            date: date.toISOString().slice(0, 10),
            slots: availability
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

export { getAvailability };
