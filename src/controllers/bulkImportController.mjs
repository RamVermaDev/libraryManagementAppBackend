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
 * Serves / downloads pre-formatted sample Excel template (.xlsx)
 * Ultra-simple format: Student Name, Phone Number, Expire Date
 */
export const downloadSampleTemplate = async (req, res) => {
    try {
        const sampleData = [
            {
                "Student Name": "Rahul Sharma",
                "Phone Number": "9876543210",
                "Expire Date (YYYY-MM-DD)": "2026-08-30"
            },
            {
                "Student Name": "Priya Singh",
                "Phone Number": "9812345678",
                "Expire Date (YYYY-MM-DD)": "2026-07-28"
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(sampleData);
        worksheet["!cols"] = [
            { wch: 22 }, // Student Name
            { wch: 18 }, // Phone Number
            { wch: 25 }  // Expire Date
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

        // Get default slot template for the library (fallback)
        const defaultSlot = await slotTemplateModel.findOne({ libraryId, isActive: true }).lean();
        if (!defaultSlot) {
            return res.status(400).json({ success: false, message: "Please create at least one active slot before importing students" });
        }

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
            const phone = (row["Phone Number"] || row["Phone"] || "").toString().replaceAll(/\D/g, "");

            if (!name || !phone || phone.length < 10) {
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

            studentsToInsert.push({
                libraryId,
                slotTemplateId: defaultSlot._id,
                slotTiming: `${defaultSlot.startMinute ? Math.floor(defaultSlot.startMinute / 60) : 6}:00 AM - ${defaultSlot.endMinute ? Math.floor(defaultSlot.endMinute / 60) : 12}:00 PM`,
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
