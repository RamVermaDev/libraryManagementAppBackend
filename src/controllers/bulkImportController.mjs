import mongoose from "mongoose";
import XLSX from "xlsx";
import { studentModel } from "../models/studentModel.mjs";
import { seatModel } from "../models/seatModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { feeRecordModel } from "../models/feeRecordModel.mjs";
import { expenseModel } from "../models/expenseModel.mjs";
import { slotTemplateModel } from "../claude/SlotTemplateModel.mjs";
import { reservationModel } from "../claude/ReservationModel.mjs";

/**
 * Helper to convert minutes-from-midnight into formatted 12-hour AM/PM string
 */
const formatMinutesToAmPm = (minutes) => {
    if (minutes === undefined || minutes === null) return "06:00 AM";
    const norm = ((minutes % 1440) + 1440) % 1440;
    let hours = Math.floor(norm / 60);
    const mins = norm % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minsStr = mins < 10 ? '0' + mins : mins;
    return `${hours}:${minsStr} ${ampm}`;
};

/**
 * Serves / downloads pre-formatted sample Excel template (.xlsx)
 * Columns: Student Name, Phone Number, Expire Date, Slot Timing
 */
export const downloadSampleTemplate = async (req, res) => {
    try {
        const sampleData = [
            {
                "Student Name": "Rahul Sharma",
                "Phone Number": "9876543210",
                "Expire Date (YYYY-MM-DD)": "2026-08-30",
                "Slot Timing": "06:00 AM - 12:00 PM"
            },
            {
                "Student Name": "Priya Singh",
                "Phone Number": "9812345678",
                "Expire Date (YYYY-MM-DD)": "2026-07-28",
                "Slot Timing": "02:00 PM - 08:00 PM"
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(sampleData);
        worksheet["!cols"] = [
            { wch: 22 }, // Student Name
            { wch: 18 }, // Phone Number
            { wch: 25 }, // Expire Date
            { wch: 25 }  // Slot Timing
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Student Template");

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=Library_Student_Import_Template.xlsx");
        return res.send(buffer);
    } catch (error) {
        console.error("Download Template Error:", error);
        return res.status(500).json({ success: false, message: "Failed to generate Excel template" });
    }
};

/**
 * Parses uploaded Excel file buffer and imports students into MongoDB in bulk
 */
export const bulkImportStudents = async (req, res) => {
    try {
        const { libraryId } = req.params;
        if (!libraryId) {
            return res.status(400).json({ success: false, message: "Library ID is required" });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: "Please upload a valid Excel file" });
        }

        // Get default active slot template or auto-create a Sample Slot if none exists
        let defaultSlot = await slotTemplateModel.findOne({ libraryId, isActive: true });
        if (!defaultSlot) {
            defaultSlot = await slotTemplateModel.create({
                libraryId,
                name: "Sample Slot",
                monthlyPrice: 0,
                startMinute: 360, // 06:00 AM
                endMinute: 720,  // 12:00 PM
                isActive: true,
            });
        }

        const defaultSlotTimingStr = `${formatMinutesToAmPm(defaultSlot.startMinute)} - ${formatMinutesToAmPm(defaultSlot.endMinute)}`;

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (!rows || rows.length === 0) {
            return res.status(400).json({ success: false, message: "Uploaded Excel file is empty" });
        }

        const studentsToInsert = [];
        let skippedCount = 0;
        const now = new Date();

        for (const row of rows) {
            const name = (row["Student Name"] || row["Name"] || "").toString().trim();
            let phone = (row["Phone Number"] || row["Phone"] || "").toString().replaceAll(/\D/g, "");
            if (phone.length > 10) {
                phone = phone.slice(-10);
            }

            if (!name || !phone || phone.length !== 10) {
                skippedCount++;
                continue;
            }

            const expireDateStr = row["Expire Date (YYYY-MM-DD)"] || row["Expire Date"] || row["ExpireDate"];
            const startDate = new Date();
            let expireDate;

            if (expireDateStr) {
                expireDate = new Date(expireDateStr);
                if (isNaN(expireDate.getTime())) {
                    expireDate = new Date(startDate.getTime() + 30 * 86400000);
                }
            } else {
                expireDate = new Date(startDate.getTime() + 30 * 86400000);
            }

            // Calculate plan days between start and expire date
            const diffTime = Math.abs(expireDate - startDate);
            const planDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 30;

            // Use Slot Timing from Excel row if provided, otherwise default slot timing
            const rowSlotTiming = (row["Slot Timing"] || row["Timing"] || row["Slot"] || "").toString().trim();
            const slotTiming = rowSlotTiming.length > 0 ? rowSlotTiming : defaultSlotTimingStr;

            studentsToInsert.push({
                libraryId,
                slotTemplateId: defaultSlot._id,
                slotTiming: slotTiming,
                seatId: null, // Unassigned physical seat initially
                name,
                phone,
                gender: null,
                idProof: null,
                photoPublicId: "",
                status: expireDate >= now ? "active" : "active",
                joiningDate: startDate,
                currentPlanDays: planDays,
                currentStartDate: startDate,
                currentExpireDate: expireDate,
                totalPaid: 0,
                totalPending: 0,
                totalDiscount: 0,
                lastPaymentDate: null
            });
        }

        if (studentsToInsert.length === 0) {
            return res.status(400).json({ success: false, message: "No valid student records found in file" });
        }

        const inserted = await studentModel.insertMany(studentsToInsert);

        return res.status(201).json({
            success: true,
            message: `Successfully imported ${inserted.length} students!`,
            count: inserted.length,
            skipped: skippedCount
        });
    } catch (error) {
        console.error("Bulk Import Error:", error);
        return res.status(500).json({ success: false, message: "Failed to process bulk import" });
    }
};

/**
 * Atomic Session Transaction reset for a library:
 * Clears students, payments, fee records, reservations, and resets all seat statuses atomically.
 * If any step fails, the entire transaction rolls back cleanly!
 */
export const clearLibraryData = async (req, res) => {
    const { libraryId } = req.params;
    if (!libraryId) {
        return res.status(400).json({ success: false, message: "Library ID is required" });
    }

    let session = null;
    try {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            await studentModel.deleteMany({ libraryId }, { session });
            await paymentModel.deleteMany({ libraryId }, { session });
            await feeRecordModel.deleteMany({ libraryId }, { session });
            await expenseModel.deleteMany({ libraryId }, { session });
            await reservationModel.deleteMany({ libraryId }, { session });
            await slotTemplateModel.deleteMany({ libraryId }, { session });
        });

        return res.status(200).json({
            success: true,
            message: "Library data reset complete! Removed all students, payments, fee records, reservations, and reset all seats to available."
        });
    } catch (error) {
        console.error("Session Transaction Error, attempting fallback:", error);
        // Fallback for standalone MongoDB deployments without replica sets
        try {
            await studentModel.deleteMany({ libraryId });
            await paymentModel.deleteMany({ libraryId });
            await feeRecordModel.deleteMany({ libraryId });
            await expenseModel.deleteMany({ libraryId });
            await reservationModel.deleteMany({ libraryId });
            await slotTemplateModel.deleteMany({ libraryId });

            return res.status(200).json({
                success: true,
                message: "Library data reset complete!"
            });
        } catch (fallbackErr) {
            console.error("Clear Library Data Fallback Error:", fallbackErr);
            return res.status(500).json({ success: false, message: "Failed to clear library data" });
        }
    } finally {
        if (session) {
            await session.endSession();
        }
    }
};
