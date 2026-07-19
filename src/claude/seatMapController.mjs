import { getSeatMap } from "./seatMapService.mjs";

/**
 * GET /api/:libraryId/seat-map?slotTemplateId=...&date=2026-07-21
 *
 * Returns every seat with status "booked" or "available" for that
 * slot + date - this is what the "pick a seat" screen renders after
 * the owner has already chosen a slot.
 */
async function getSeatMapForSlot(req, res) {
    try {
        const { libraryId } = req.params;
        const { slotTemplateId, date } = req.query;

        if (!slotTemplateId) {
            return res.status(400).json({
                success: false,
                message: "slotTemplateId is required",
            });
        }

        const targetDate = date ? new Date(date) : new Date();
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format",
            });
        }

        const seatMap = await getSeatMap(libraryId, slotTemplateId, targetDate);

        return res.status(200).json({
            success: true,
            libraryId,
            slotTemplateId,
            date: targetDate.toISOString().slice(0, 10),
            totalSeats: seatMap.length,
            bookedCount: seatMap.filter((s) => s.status === "booked").length,
            availableCount: seatMap.filter((s) => s.status === "available").length,
            seats: seatMap,
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }
}

export { getSeatMapForSlot };
