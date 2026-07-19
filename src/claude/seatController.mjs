
import { createSeatsForLibrary, addMoreSeats, getSeatsForLibrary, setSeatStatus } from "./seatService.mjs";


/**
 * POST /libraries/:libraryId/seats
 * Body: { totalSeats: 50 }
 *
 * Called once, typically right after the owner creates the library.
 */
export async function createSeats(req, res) {
  console.log('Something')
  try {
    const { libraryId } = req.params;
    const { totalSeats } = req.body;

    

    const seats = await createSeatsForLibrary(libraryId, totalSeats);

    res.status(201).json({
      message: `${seats.length} seats created successfully`,
      seats,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * POST /libraries/:libraryId/seats/add
 * Body: { extraSeats: 10 }
 */
export async function addSeats(req, res) {
  try {
    const { libraryId } = req.params;
    const { extraSeats } = req.body;

    const seats = await addMoreSeats(libraryId, extraSeats);

    res.status(201).json({
      message: `${seats.length} additional seats created`,
      seats,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * GET /libraries/:libraryId/seats?status=active
 */
export async function listSeats(req, res) {
  try {
    const { libraryId } = req.params;
    const { status } = req.query;

    const seats = await getSeatsForLibrary(libraryId, status);
    res.status(200).json({ count: seats.length, seats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * PATCH /seats/:seatId/status
 * Body: { status: "disabled" }
 */
export async function updateSeatStatus(req, res) {
  try {
    const { seatId } = req.params;
    const { status } = req.body;

    const seat = await setSeatStatus(seatId, status);
    if (!seat) return res.status(404).json({ error: "Seat not found" });

    res.status(200).json({ message: "Seat status updated", seat });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
