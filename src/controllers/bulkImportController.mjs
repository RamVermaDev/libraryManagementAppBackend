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
import sendEmail from "../utils/sendEmail.mjs";

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
 * Generates sample Excel template (.xlsx) in-memory and sends it via Brevo email to the user
 */
export const emailSampleTemplate = async (req, res) => {
    try {
        const userEmail = req.user?.email;
        const userName = req.user?.name || "Library Owner";

        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: "User email not found. Please ensure you are logged in."
            });
        }

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
        const base64Attachment = buffer.toString("base64");

        const fileName = "Library_Student_Import_Template.xlsx";
        const subject = `LibraryDesk — Student Import Template & Guide`;
        const plainText = `Hello ${userName || "there"},\n\nThe official 12-column Excel template for importing students into LibraryDesk is attached to this email (${fileName}).\n\n2 Mandatory Required Fields:\n1. Student Name — Student's complete name (Column A)\n2. Phone Number — Valid 10-digit mobile number (Column B)\n\nAll other 10 columns (Student ID, Gender, Date of Birth, Joining Date, Expire Date, Slot Timing, Guardian Name, Guardian Phone, Address, ID Proof) are optional and can be left blank.\n\nQuick Steps:\n1. Open the attached spreadsheet (${fileName}).\n2. Fill in your student details adhering to the 2 mandatory columns (use YYYY-MM-DD for dates).\n3. Note: Student IDs are auto-generated by LibraryDesk sequentially (001, 002...) if left blank.\n4. Return to the LibraryDesk app and upload your completed .xlsx file under Bulk Import.\n\nAttached file: ${fileName}\n\n@${new Date().getFullYear()} LibraryDesk. All rights reserved.`;

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F4F5F0; margin: 0; padding: 24px; color: #141713; }
    .container { max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 20px; border: 1px solid #E8EAE3; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
    .brand { font-size: 22px; font-weight: 800; color: #141713; margin-bottom: 24px; letter-spacing: -0.5px; }
    .brand span { color: #2563EB; }
    .title { font-size: 18px; font-weight: 700; color: #141713; margin-bottom: 8px; }
    .desc { font-size: 14px; color: #71717A; line-height: 1.6; margin-bottom: 20px; }
    .info-card { background: #F7F7F6; border: 1px solid #E8EAE3; border-radius: 14px; padding: 18px; margin-bottom: 24px; font-size: 13px; color: #3F3F46; line-height: 1.5; }
    .attach-note { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 12px; font-size: 13px; color: #166534; font-weight: 600; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #A1A1AA; text-align: center; margin-top: 32px; border-top: 1px solid #E8EAE3; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">Library<span>Desk</span></div>
    <div class="title">Student Import Template</div>
    <div class="desc">Hello ${userName || "there"},<br>The official 12-column Excel template for importing students into LibraryDesk is attached to this email.</div>
    <div class="info-card">
      <strong style="color: #141713;">2 Mandatory Required Fields:</strong><br>
      <ul style="margin: 8px 0 12px 18px; padding: 0;">
        <li><strong>Student Name</strong> — Student's complete name (Column A)</li>
        <li><strong>Phone Number</strong> — Valid 10-digit mobile number (Column B)</li>
      </ul>
      <span style="color: #71717A; font-size: 12px;">All other 10 columns (Student ID, Gender, Date of Birth, Joining Date, Expire Date, Slot Timing, Guardian Name, Guardian Phone, Address, ID Proof) are optional and can be left blank.</span>
    </div>
    <div class="info-card" style="background: #FFFFFF; border: 1px solid #E8EAE3;">
      <strong style="color: #141713;">Quick Steps:</strong><br>
      1. Open the attached spreadsheet (<code>${fileName}</code>).<br>
      2. Fill in your student details adhering to the 2 mandatory columns (use <code>YYYY-MM-DD</code> for dates).<br>
      3. Note: Student IDs are auto-generated by LibraryDesk sequentially (001, 002...) if left blank.<br>
      4. Return to the LibraryDesk app and upload your completed <code>.xlsx</code> file under Bulk Import.
    </div>
    <div class="attach-note">Attached file: ${fileName}</div>
    <div class="footer">@${new Date().getFullYear()} LibraryDesk. All rights reserved.</div>
  </div>
</body>
</html>
        `;

        await sendEmail({
            to: userEmail,
            recipientName: userName,
            subject: subject,
            text: plainText,
            html: htmlContent,
            attachments: [
                {
                    name: "Library_Student_Import_Template.xlsx",
                    content: base64Attachment
                }
            ]
        });

        return res.status(200).json({
            success: true,
            message: `Sample Excel template emailed successfully to ${userEmail}`,
            data: {
                success: true,
                recipientEmail: userEmail
            }
        });
    } catch (error) {
        console.error("Email Sample Template Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to email sample template. Please check email configuration."
        });
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
