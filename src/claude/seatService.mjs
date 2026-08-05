import { seatModel } from "../models/seatModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { reservationModel } from "./ReservationModel.mjs";

/**
 * Create N seats for a library in one go.
 * Called once when the owner sets up the library (or resets seat count).
 *
 * @param {String} libraryId
 * @param {Number} totalSeats  e.g. 50
 */
export async function createSeatsForLibrary(libraryId, totalSeats, prefix = 'A') {
  if (!totalSeats || totalSeats <= 0) {
    throw new Error("totalSeats must be a positive number");
  }

  // Build 50 (or however many) plain seat documents.
  const seatDocs = [];
  for (let seatNumber = 1; seatNumber <= totalSeats; seatNumber++) {
    seatDocs.push({
      libraryId,
      seatNumber,
      label: `${prefix}-${seatNumber}`,
      status: "active",
    });
  }

  try {
    const result = await seatModel.insertMany(seatDocs, { ordered: false });
    await libraryModel.findByIdAndUpdate(libraryId, {
      totalSeats: totalSeats,
    });
    return result;
  } catch (err) {
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

  const prefixMatch = lastSeat?.label ? String(lastSeat.label).match(/^([A-Za-z]+)/) : null;
  const prefix = prefixMatch ? prefixMatch[1] : 'A';

  const newSeatDocs = [];
  for (let i = 0; i < extraSeats; i++) {
    const seatNum = startFrom + i;
    newSeatDocs.push({
      libraryId,
      seatNumber: seatNum,
      label: `${prefix}-${seatNum}`,
      status: "active",
    });
  }

  const result = await seatModel.insertMany(newSeatDocs, { ordered: false });
  const newTotal = (lastSeat ? lastSeat.seatNumber : 0) + extraSeats;

  await libraryModel.findByIdAndUpdate(libraryId, {
    totalSeats: newTotal,
  });

  return result;
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
 * Get seat layout and configuration details.
 */
export async function getSeatConfiguration(libraryId) {
  const library = await libraryModel.findById(libraryId).lean();
  if (!library) throw new Error("Library not found");

  const seatLayout = library.seatLayout || {};
  const seats = await seatModel.find({ libraryId }).sort({ seatNumber: 1 }).lean();

  const totalSeats = Math.max(library.totalSeats || 0, seats.length);
  const activeCount = await seatModel.countDocuments({ libraryId, status: "active" });

  const firstSeatLabel = seats.length > 0 ? seats[0].label : '';
  const detectedPrefix = firstSeatLabel ? (String(firstSeatLabel).match(/^([A-Za-z]+)/)?.[1] ?? 'A') : 'A';

  const cols = seatLayout.columns || 6;
  const rws = seatLayout.rows || (totalSeats > 0 ? Math.ceil(totalSeats / cols) : 1);

  return {
    totalSeats,
    availableSeats: activeCount,
    rows: rws,
    columns: cols,
    prefix: detectedPrefix,
    seats,
  };
}

/**
 * Update total seats, row/col layout with safety checks on decrease.
 * Iterates and updates all seat labels when prefix is modified.
 */
export async function updateSeatConfiguration(libraryId, { totalSeats, rows, columns, prefix }) {
  const library = await libraryModel.findById(libraryId);
  if (!library) throw new Error("Library not found");

  const existingSeats = await seatModel.find({ libraryId }).sort({ seatNumber: 1 });
  const currentTotal = Math.max(library.totalSeats || 0, existingSeats.length);
  const targetTotal = Number(totalSeats) > 0 ? Number(totalSeats) : currentTotal;

  const targetColumns = Number(columns) > 0 ? Number(columns) : (library.seatLayout?.columns || 6);
  const targetRows = Number(rows) > 0 ? Number(rows) : (library.seatLayout?.rows || (targetTotal > 0 ? Math.ceil(targetTotal / targetColumns) : 1));
  const targetPrefix = prefix && String(prefix).trim().length > 0 ? String(prefix).trim() : null;

  // 1. If decreasing seats, check for active student bookings on affected seats
  if (targetTotal < currentTotal) {
    const seatsToRemove = await seatModel
      .find({ libraryId, seatNumber: { $gt: targetTotal } })
      .select("_id seatNumber label")
      .lean();

    const seatIdsToRemove = seatsToRemove.map((s) => s._id);

    if (seatIdsToRemove.length > 0) {
      const activeReservations = await reservationModel
        .find({
          libraryId,
          seatId: { $in: seatIdsToRemove },
          status: { $in: ["active", "overbooked_pending"] },
        })
        .populate("studentId", "name phone")
        .lean();

      if (activeReservations.length > 0) {
        const affectedDetails = activeReservations.map((r) => ({
          studentName: r.studentId?.name || "Student",
          phone: r.studentId?.phone || "",
          seatId: r.seatId,
        }));

        const err = new Error(
          `Cannot decrease seats to ${targetTotal}. ${activeReservations.length} active booking(s) exist on affected seats.`
        );
        err.statusCode = 400;
        err.conflict = true;
        err.affectedBookings = affectedDetails;
        throw err;
      }

      await seatModel.deleteMany({ libraryId, seatNumber: { $gt: targetTotal } });
    }
  }

  // 2. If prefix changed, update all existing seat labels in MongoDB directly
  const effectivePrefix = targetPrefix || (existingSeats.length > 0 ? (String(existingSeats[0].label).match(/^([A-Za-z0-9]+)/)?.[1] ?? 'A') : 'A');
  if (targetPrefix && existingSeats.length > 0) {
    for (const seat of existingSeats) {
      if (seat.seatNumber <= targetTotal) {
        seat.label = `${effectivePrefix}-${seat.seatNumber}`;
        await seat.save();
      }
    }
  }

  // 3. If increasing seats, insert new seat documents with the new prefix
  if (targetTotal > currentTotal) {
    const newSeats = [];
    for (let seatNumber = currentTotal + 1; seatNumber <= targetTotal; seatNumber++) {
      newSeats.push({
        libraryId,
        seatNumber,
        label: `${effectivePrefix}-${seatNumber}`,
        status: "active",
      });
    }
    if (newSeats.length > 0) {
      await seatModel.insertMany(newSeats, { ordered: false });
    }
  }

  // 4. Update library document
  library.totalSeats = targetTotal;
  library.seatLayout = {
    rows: targetRows,
    columns: targetColumns,
  };

  await library.save();

  const updatedSeats = await seatModel.find({ libraryId }).sort({ seatNumber: 1 }).lean();
  const activeCount = await seatModel.countDocuments({ libraryId, status: "active" });

  return {
    totalSeats: library.totalSeats,
    availableSeats: activeCount,
    rows: library.seatLayout.rows,
    columns: library.seatLayout.columns,
    prefix: effectivePrefix,
    seats: updatedSeats,
  };
}

/**
 * Get the count of currently usable (active) seats.
 */
export async function getActiveSeatCount(libraryId) {
  return seatModel.countDocuments({ libraryId, status: "active" });
}

/**
 * Disable / re-enable a specific seat.
 */
export async function setSeatStatus(seatId, status) {
  if (!["active", "disabled", "maintenance"].includes(status)) {
    throw new Error("Invalid seat status");
  }
  return seatModel.findByIdAndUpdate(seatId, { status }, { new: true });
}

/**
 * Remove all seats for a library.
 */
export async function deleteAllSeatsForLibrary(libraryId) {
  return seatModel.deleteMany({ libraryId });
}
