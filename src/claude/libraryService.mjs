//import { libraryModel } from "../models/Library.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { createSeatsForLibrary } from "./seatService.mjs";

/**
 * Create a library AND auto-provision its seats in one step.
 * This is what your "owner sets up library with 50 seats" flow calls.
 *
 * @param {Object} libraryData  everything from your libraryModel fields
 * @param {Number} totalSeats   e.g. 50
 */
async function createLibraryWithSeats(libraryData, totalSeats) {
    if (!totalSeats || totalSeats <= 0) {
        throw new Error("totalSeats must be a positive number");
    }

    // 1. Create the library document first (we need its _id for seats)
    const library = await libraryModel.create({
        ...libraryData,
        totalSeats // cached field - legitimate here, only changes on admin action
    });

    // 2. Auto-create the seat documents for it
    await createSeatsForLibrary(library._id, totalSeats);

    return library;
}

/**
 * Add more seats to an existing library later (owner expands 50 -> 60).
 * Keeps library.totalSeats in sync since it's a cached, rarely-changing field.
 */
async function expandLibrarySeats(libraryId, extraSeats) {
    const { addMoreSeats } = await import("./seatService.mjs");
    const newSeats = await addMoreSeats(libraryId, extraSeats);

    await libraryModel.findByIdAndUpdate(libraryId, {
        $inc: { totalSeats: newSeats.length }
    });

    return newSeats;
}

export { createLibraryWithSeats, expandLibrarySeats };
