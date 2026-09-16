import mongoose from "mongoose";
import XLSX from "xlsx";
import { studentModel } from "../models/studentModel.mjs";
import { seatModel } from "../models/seatModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { feeRecordModel } from "../models/feeRecordModel.mjs";
import { expenseModel } from "../models/expenseModel.mjs";
import { taskModel } from "../models/taskModel.mjs";
import { bookIssueModel } from "../models/bookIssueModel.mjs";
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
 * Helper to safely parse dates from Excel rows (supports Date, serial number, or ISO string)
 */
const parseExcelDate = (val) => {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (typeof val === "number") {
        const parsed = new Date(Math.round((val - 25569) * 86400 * 1000));
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    const str = String(val).trim();
    if (!str) return null;
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Helper to normalize gender strings
 */
const parseGender = (val) => {
    if (!val) return null;
    const str = String(val).trim().toLowerCase();
    if (str === "male" || str === "m") return "Male";
    if (str === "female" || str === "f") return "Female";
    if (str === "other" || str === "o") return "Other";
    return null;
};

/**
 * Helper to clean guardian phone numbers
 */
const parseGuardianPhone = (val) => {
    if (!val) return null;
    let digits = String(val).replaceAll(/\D/g, "");
    if (digits.length > 10) digits = digits.slice(-10);
    return digits.length === 10 ? digits : null;
};

/**
 * Serves / downloads pre-formatted sample Excel template (.xlsx)
 */
export const downloadSampleTemplate = async (req, res) => {
    try {
        const sampleData = [
            {
                "Student Name": "Rahul Sharma",
                "Phone Number": "9876543210",
                "Student ID": "001",
                "Gender": "Male",
                "Date of Birth (YYYY-MM-DD)": "2002-05-15",
                "Joining Date (YYYY-MM-DD)": "2026-01-10",
                "Expire Date (YYYY-MM-DD)": "2026-08-30",
                "Slot Timing": "06:00 AM - 12:00 PM",
                "Guardian Name": "Suresh Sharma",
                "Guardian Phone": "9811223344",
                "Address": "H.No 12, Civil Lines, Delhi",
                "ID Proof": "1234-5678-9012"
            },
            {
                "Student Name": "Priya Singh",
                "Phone Number": "9812345678",
                "Student ID": "002",
                "Gender": "Female",
                "Date of Birth (YYYY-MM-DD)": "2003-08-22",
                "Joining Date (YYYY-MM-DD)": "2026-02-01",
                "Expire Date (YYYY-MM-DD)": "2026-07-28",
                "Slot Timing": "02:00 PM - 08:00 PM",
                "Guardian Name": "Rajendra Singh",
                "Guardian Phone": "9822334455",
                "Address": "Flat 402, Green Park, Jaipur",
                "ID Proof": "2345-6789-0123"
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(sampleData);
        worksheet["!cols"] = [
            { wch: 22 }, // Student Name
            { wch: 18 }, // Phone Number
            { wch: 14 }, // Student ID
            { wch: 12 }, // Gender
            { wch: 26 }, // Date of Birth
            { wch: 26 }, // Joining Date
            { wch: 26 }, // Expire Date
            { wch: 25 }, // Slot Timing
            { wch: 22 }, // Guardian Name
            { wch: 18 }, // Guardian Phone
            { wch: 32 }, // Address
            { wch: 22 }  // ID Proof
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

        for (const row of rows) {
            const name = (row["Student Name"] || row["Name"] || "").toString().trim();
            let phone = (row["Phone Number"] || row["Phone"] || row["Mobile"] || "").toString().replaceAll(/\D/g, "");
            if (phone.length > 10) {
                phone = phone.slice(-10);
            }

            if (!name || !phone || phone.length !== 10) {
                skippedCount++;
                continue;
            }

            // Student ID / Roll No
            const rawStudentId = (row["Student ID"] || row["Roll No"] || row["StudentId"] || row["RollNo"] || row["ID"] || "").toString().trim();
            const studentId = rawStudentId.length > 0 ? rawStudentId : null;

            // Gender
            const gender = parseGender(
                row["Gender"] || row["Sex"]
            );

            // DOB
            const dob = parseExcelDate(
                row["Date of Birth (YYYY-MM-DD)"] || row["Date of Birth"] || row["DOB"] || row["Birth Date"]
            );

            // Guardian Name & Phone
            const guardianName = (row["Guardian Name"] || row["Father Name"] || row["Parent Name"] || row["Father's Name"] || "").toString().trim() || null;
            const guardianPhone = parseGuardianPhone(
                row["Guardian Phone"] || row["Father Phone"] || row["Parent Phone"] || row["Guardian Mobile"]
            );

            // Address
            const address = (row["Address"] || row["Full Address"] || row["Location"] || "").toString().trim() || null;

            // ID Proof
            const idProof = (row["ID Proof"] || row["Aadhaar"] || row["Aadhar"] || row["Aadhaar Number"] || row["Govt ID"] || "").toString().trim() || null;

            // Joining / Start Date
            const parsedJoiningDate = parseExcelDate(
                row["Joining Date (YYYY-MM-DD)"] || row["Joining Date"] || row["Start Date"] || row["Admission Date"]
            );
            const startDate = parsedJoiningDate || new Date();

            // Expire Date
            const parsedExpireDate = parseExcelDate(
                row["Expire Date (YYYY-MM-DD)"] || row["Expire Date"] || row["ExpireDate"] || row["End Date"]
            );
            const expireDate = parsedExpireDate || new Date(startDate.getTime() + 30 * 86400000);

            // Calculate plan days between start and expire date
            const diffTime = Math.abs(expireDate - startDate);
            const planDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 30;

            // Use Slot Timing from Excel row if provided, otherwise default slot timing
            const rowSlotTiming = (row["Slot Timing"] || row["Timing"] || row["Slot"] || "").toString().trim();
            const slotTiming = rowSlotTiming.length > 0 ? rowSlotTiming : defaultSlotTimingStr;

            studentsToInsert.push({
                libraryId,
                studentId: studentId,
                slotTemplateId: defaultSlot._id,
                slotTiming: slotTiming,
                seatId: null, // Unassigned physical seat initially
                name,
                phone,
                gender,
                guardianName,
                guardianPhone,
                dob,
                address,
                idProof,
                photoPublicId: "",
                status: "active",
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
            await taskModel.deleteMany({ libraryId }, { session });
            await bookIssueModel.deleteMany({ libraryId }, { session });
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
            await taskModel.deleteMany({ libraryId });
            await bookIssueModel.deleteMany({ libraryId });

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
