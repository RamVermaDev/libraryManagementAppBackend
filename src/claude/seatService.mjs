import { seatModel } from "../models/seatModel.mjs";

/**
 * Create N seats for a library in one go.
 * Called once when the owner sets up the library (or resets seat count).
 *
 * @param {String} libraryId
 * @param {Number} totalSeats  e.g. 50
 */
export async function createSeatsForLibrary(libraryId, totalSeats) {
  if (!totalSeats || totalSeats <= 0) {
    throw new Error("totalSeats must be a positive number");
  }

  // Build 50 (or however many) plain seat documents.
  const seatDocs = [];
  for (let seatNumber = 1; seatNumber <= totalSeats; seatNumber++) {
    seatDocs.push({
      libraryId,
      seatNumber,
      status: "active",
    });
  }

  try {
    // insertMany writes all documents in a single round trip.
    // ordered:false lets Mongo skip any single duplicate-key failure
    // instead of aborting the whole batch.
    const result = await seatModel.insertMany(seatDocs, { ordered: false });
    return result;
  } catch (err) {
    // err.code 11000 = duplicate key (seat already exists for this library)
    if (err.code === 11000) {
      throw new Error(
        "Some seat numbers already exist for this library. Use addMoreSeats() to append new seats instead."
      );
    }
    throw err;
  }
}

/**
 * Add extra seats later without touching existing ones.
 * e.g. library grows from 50 -> 60 seats.
 *
 * @param {String} libraryId
 * @param {Number} extraSeats  e.g. 10
 */
export async function addMoreSeats(libraryId, extraSeats) {
  const lastSeat = await seatModel.findOne({ libraryId })
    .sort({ seatNumber: -1 })
    .lean();

  const startFrom = lastSeat ? lastSeat.seatNumber + 1 : 1;

  const newSeatDocs = [];
  for (let i = 0; i < extraSeats; i++) {
    newSeatDocs.push({
      libraryId,
      seatNumber: startFrom + i,
      status: "active",
    });
  }

  return seatModel.insertMany(newSeatDocs, { ordered: false });
}

/**
 * Get all seats for a library, optionally filtered by status.
 * e.g. getSeatsForLibrary(libId, "active") -> only usable seats
 */
export async function getSeatsForLibrary(libraryId, status = null) {
  const filter = { libraryId };
  if (status) filter.status = status;
  return seatModel.find(filter).sort({ seatNumber: 1 }).lean();
}

/**
 * Get the count of currently usable (active) seats.
 * Use this instead of a hardcoded library.totalSeats when seats
 * can be individually disabled for maintenance.
 */
export async function getActiveSeatCount(libraryId) {
  return seatModel.countDocuments({ libraryId, status: "active" });
}

/**
 * Disable / re-enable a specific seat (e.g. broken chair, under repair).
 */
export async function setSeatStatus(seatId, status) {
  if (!["active", "disabled", "maintenance"].includes(status)) {
    throw new Error("Invalid seat status");
  }
  return seatModel.findByIdAndUpdate(seatId, { status }, { new: true });
}

/**
 * Remove all seats for a library (rarely needed — usually you disable
 * seats instead of deleting them, to preserve reservation history/foreign keys).
 */
export async function deleteAllSeatsForLibrary(libraryId) {
  return seatModel.deleteMany({ libraryId });
}
