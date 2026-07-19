import {
    createReservationForLibrary,
    cancelReservation as cancelReservationForLibrary,
    renewReservation as renewReservationForLibrary,
    editReservation as editReservationForLibrary
} from "./bookingService.mjs";

/**
 * POST /reservations
 * Body: { libraryId, studentId, slotTemplateId, subscriptionStartDate, subscriptionExpiryDate }
 *
 * Always succeeds (never blocked by capacity). Response includes
 * overbookingWarning if no physical seat was free.
 */
async function createReservation(req, res) {
    try {
        const { reservation, overbookingWarning } = await createReservationForLibrary(req.body);

        res.status(201).json({
            message: overbookingWarning
                ? "Reservation created (overbooked - no seat assigned yet)"
                : "Reservation created successfully",
            reservation,
            overbookingWarning
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

/**
 * PATCH /reservations/:reservationId/cancel
 */
async function cancelReservation(req, res) {
    try {
        const { reservationId } = req.params;
        const reservation = await cancelReservationForLibrary(reservationId);

        res.status(200).json({
            message: "Reservation cancelled successfully",
            reservation
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

/**
 * POST /reservations/:reservationId/renew
 * Body: { subscriptionStartDate, subscriptionExpiryDate }
 */
async function renewReservation(req, res) {
    try {
        const { reservationId } = req.params;
        const { subscriptionStartDate, subscriptionExpiryDate } = req.body;

        const { reservation, overbookingWarning } = await renewReservationForLibrary(
            reservationId,
            subscriptionStartDate,
            subscriptionExpiryDate
        );

        res.status(201).json({
            message: overbookingWarning ? "Renewed (overbooked - no seat assigned yet)" : "Renewed successfully",
            reservation,
            overbookingWarning
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

/**
 * PATCH /reservations/:reservationId
 * Body: any of { slotTemplateId, subscriptionStartDate, subscriptionExpiryDate }
 */
async function editReservation(req, res) {
    try {
        const { reservationId } = req.params;
        const updatedReservation = await editReservationForLibrary(reservationId, req.body);

        res.status(200).json({
            message: "Reservation updated successfully",
            reservation: updatedReservation
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

export { createReservation, cancelReservation, renewReservation, editReservation };
