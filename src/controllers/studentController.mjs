import mongoose from "mongoose";
import { studentModel } from "../models/studentModel.mjs";
import { feeRecordModel } from "../models/feeRecordModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { reservationModel } from "../claude/ReservationModel.mjs";
import { slotTemplateModel } from "../claude/SlotTemplateModel.mjs";
import { bookIssueModel } from "../models/bookIssueModel.mjs";
import { validateObjectId } from "../helper/validatorHelper.mjs";
import { updateStudentProfileService } from "../services/studentService.mjs";

import cloudinary from "../../config/cloudinary.mjs";

function startOfDay(dateInput) {
    if (!dateInput) {
        const now = new Date();
        return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    }
    const dateStr = String(dateInput).split('T')[0];
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
    }
    const d = new Date(dateInput);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(dateInput) {
    if (!dateInput) {
        const now = new Date();
        return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
    }
    const dateStr = String(dateInput).split('T')[0];
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999));
    }
    const d = new Date(dateInput);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}


function getSignedPhotoUrl(photoPublicId) {
    if (!photoPublicId) return null;
    try {
        return cloudinary.url(photoPublicId, {
            type: "authenticated",
            sign_url: true,
            secure: true,
            expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
        });
    } catch (e) {
        return null;
    }
}

function attachSignedPhotoUrl(student) {
    if (!student) return student;
    const doc = student.toObject ? student.toObject() : { ...student };
    const profileImage = getSignedPhotoUrl(doc.photoPublicId);
    return {
        ...doc,
        profileImage,
    };
}

function attachSignedPhotoUrls(students) {
    if (!Array.isArray(students)) return students;
    return students.map(attachSignedPhotoUrl);
}

function formatSlotTiming(startMin, endMin) {
    if (startMin === undefined || endMin === undefined) return "";
    const formatTime = (minutes) => {
        const h = Math.floor(minutes / 60) % 24;
        const m = minutes % 60;
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        const mStr = m < 10 ? "0" + m : m;
        const hStr = h12 < 10 ? "0" + h12 : h12;
        return `${hStr}:${mStr} ${ampm}`;
    };
    return `${formatTime(startMin)} - ${formatTime(endMin)}`;
}

const addStudent = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const userId = req.user.id

        const {
            libraryId,
            studentId: customStudentId,
            slotTemplateId,
            seatId,
            name,
            phone,
            guardianName,
            guardianPhone,
            dob,
            address,
            idProof,
            photoPublicId,
            currentPlanDays,
            startDate,
            expireDate,
            amount,
            admissionFee = 0,
            cardFee = 0,
            lockerFee = 0,
            discount = 0,
            paidAmount = 0,
            cashAmount = 0,
            onlineAmount = 0,
            paymentMode,
            notes,
        } = req.body;



        // Get library from authenticated user
        //if I can use then i will
        //const libraryId = req.user.libraryId;

        if (!libraryId) {
            return res.status(400).json({
                success: false,
                message: "Library ID is required",
            });
        }

        // if (!mongoose.Types.ObjectId.isValid(libraryId)) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Invalid library ID",
        //     });
        // }

        validateObjectId(libraryId, 'Library Id')

        //ALSO IN SESSION WENEED TO ADD LIBRARY TOTAL STUDENT



        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        // 0b. VALIDATE SLOT + FETCH ITS TIME WINDOW

        if (!slotTemplateId) {
            return res.status(400).json({
                success: false,
                message: "Slot is required",
            });
        }

        validateObjectId(slotTemplateId, 'Slot ID')

        const slotTemplate = await slotTemplateModel
            .findOne({ _id: slotTemplateId, libraryId })
            .select("startMinute endMinute name")
            .lean();

        if (!slotTemplate) {
            return res.status(404).json({
                success: false,
                message: "Slot not found for this library",
            });
        }

        if (seatId && !mongoose.Types.ObjectId.isValid(seatId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid seat ID",
            });
        }

        // 1. VALIDATE REQUIRED FIELDS

        if (
            !name ||
            !phone ||
            !currentPlanDays ||
            !startDate ||
            !expireDate ||
            amount === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Required fields are missing",
            });
        }

        // Payment mode is required only if money is paid
        if (Number(paidAmount) > 0 && !paymentMode) {
            return res.status(400).json({
                success: false,
                message: "Payment mode is required when payment is made",
            });
        }


        // 2. NORMALIZE DATA
        const normalizedName = name.trim();
        const normalizedPhone = phone.trim();

        const numericPlanDays = Number(currentPlanDays);
        const numericAmount = Number(amount);
        const numericDiscount = Number(discount);
        const numericPaidAmount = Number(paidAmount);

        const parsedStartDate = startOfDay(startDate);
        const parsedExpireDate = endOfDay(expireDate);

        console.log(startDate);
        console.log(parsedStartDate);
        console.log(parsedStartDate.toISOString());


        // 3. VALIDATE NUMBERS
        if (
            !Number.isFinite(numericPlanDays) ||
            numericPlanDays <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Plan days must be greater than 0",
            });
        }

        if (
            !Number.isFinite(numericAmount) ||
            !Number.isFinite(numericDiscount) ||
            !Number.isFinite(numericPaidAmount)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid amount value",
            });
        }

        if (
            numericAmount < 0 ||
            numericDiscount < 0 ||
            numericPaidAmount < 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Amount values cannot be negative",
            });
        }


        // 4. CALCULATE FEE
        const finalAmount = numericAmount - numericDiscount;

        if (finalAmount < 0) {
            return res.status(400).json({
                success: false,
                message: "Discount cannot be greater than amount",
            });
        }

        if (numericPaidAmount > finalAmount) {
            return res.status(400).json({
                success: false,
                message: "Paid amount cannot be greater than final amount",
            });
        }

        const pendingAmount = finalAmount - numericPaidAmount;

        // 5. VALIDATE DATES

        if (
            Number.isNaN(parsedStartDate.getTime()) ||
            Number.isNaN(parsedExpireDate.getTime())
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid start or expire date",
            });
        }

        if (parsedExpireDate <= parsedStartDate) {
            return res.status(400).json({
                success: false,
                message: "Expire date must be after start date",
            });
        }

        // 8. STUDENT ID VALIDATION & AUTO-SEQUENTIAL CALCULATION
        let finalStudentId = customStudentId ? String(customStudentId).trim() : null;

        if (finalStudentId) {
            let searchIds = [finalStudentId];
            if (/^\d+$/.test(finalStudentId)) {
                const num = parseInt(finalStudentId, 10);
                searchIds = [
                    String(num),
                    String(num).padStart(2, "0"),
                    String(num).padStart(3, "0"),
                    String(num).padStart(4, "0"),
                    finalStudentId,
                ];
                finalStudentId = String(num).padStart(3, "0");
            }
            const duplicateStudentId = await studentModel
                .findOne({
                    libraryId: libraryId,
                    studentId: { $in: searchIds },
                })
                .select("_id")
                .lean();

            if (duplicateStudentId) {
                return res.status(409).json({
                    success: false,
                    message: `Student ID "${finalStudentId}" is already assigned to another student in this library`,
                });
            }
        } else {
            // Auto-sequential calculation using numeric index collation
            const lastStudent = await studentModel
                .findOne({
                    libraryId: libraryId,
                    studentId: { $exists: true, $ne: null, $ne: "" },
                })
                .sort({ studentId: -1 })
                .collation({ locale: "en_US", numericOrdering: true })
                .select("studentId")
                .lean();

            let nextNum = 1;
            if (lastStudent && lastStudent.studentId) {
                const lastNum = parseInt(String(lastStudent.studentId).replace(/\D/g, ""), 10);
                if (!isNaN(lastNum)) {
                    nextNum = lastNum + 1;
                }
            }
            finalStudentId = String(nextNum).padStart(3, "0");
        }

        let normalizedGuardianPhone = null;
        if (guardianPhone !== undefined && guardianPhone !== null && String(guardianPhone).trim() !== "") {
            normalizedGuardianPhone = String(guardianPhone).trim();
            if (!/^[6-9]\d{9}$/.test(normalizedGuardianPhone)) {
                return res.status(400).json({
                    success: false,
                    message: "Enter a valid Indian phone number for guardian",
                });
            }
        }

        let parsedDob = null;
        if (dob !== undefined && dob !== null && String(dob).trim() !== "") {
            parsedDob = new Date(dob);
            if (Number.isNaN(parsedDob.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid Date of Birth",
                });
            }
        }

        // 9. START TRANSACTION

        session.startTransaction();

        // 10. CREATE STUDENT

        const [student] = await studentModel.create(
            [
                {
                    libraryId: libraryId,
                    studentId: finalStudentId,
                    slotTemplateId: slotTemplateId,
                    slotTiming: formatSlotTiming(slotTemplate.startMinute, slotTemplate.endMinute),
                    seatId: seatId,

                    name: normalizedName,
                    phone: normalizedPhone,

                    guardianName: guardianName?.trim() || null,
                    guardianPhone: normalizedGuardianPhone,
                    dob: parsedDob,
                    address: address?.trim() || null,

                    idProof: idProof?.trim() || null,
                    photoPublicId: photoPublicId?.trim() || "",

                    joiningDate: parsedStartDate,

                    currentPlanDays: numericPlanDays,
                    currentStartDate: parsedStartDate,
                    currentExpireDate: parsedExpireDate,

                    totalPaid: numericPaidAmount,
                    totalPending: pendingAmount,
                    totalDiscount: numericDiscount,

                    lastPaymentDate:
                        numericPaidAmount > 0 ? new Date() : null,

                    notes: notes?.trim() || null,
                },
            ],
            { session }
        );


        // 11. CREATE FIRST FEE RECORD

        const [feeRecord] = await feeRecordModel.create(
            [
                {
                    libraryId: libraryId,
                    studentId: student._id,
                    slotId: slotTemplateId,

                    planDays: numericPlanDays,

                    startDate: parsedStartDate,
                    expireDate: parsedExpireDate,

                    amount: numericAmount,
                    admissionFee: Number(admissionFee) || 0,
                    cardFee: Number(cardFee) || 0,
                    lockerFee: Number(lockerFee) || 0,
                    discount: numericDiscount,
                    finalAmount,
                    paidAmount: numericPaidAmount,
                    pendingAmount,
                },
            ],
            { session }
        );

        // 12. CREATE PAYMENT IF MONEY WAS PAID

        let payment = null;
        let payments = [];

        if (numericPaidAmount > 0) {
            if (paymentMode === "Both") {
                let numericOnline = Math.min(Number(onlineAmount) || 0, numericPaidAmount);
                let numericCash = Math.max(0, numericPaidAmount - numericOnline);

                if (numericCash > 0) {
                    const [cashPay] = await paymentModel.create(
                        [
                            {
                                libraryId,
                                student: student._id,
                                feeRecord: feeRecord._id,
                                amount: numericCash,
                                paymentMode: "Cash",
                                tracker: "credit",
                                paymentDate: new Date(),
                            },
                        ],
                        { session }
                    );
                    payments.push(cashPay);
                }

                if (numericOnline > 0) {
                    const [onlinePay] = await paymentModel.create(
                        [
                            {
                                libraryId,
                                student: student._id,
                                feeRecord: feeRecord._id,
                                amount: numericOnline,
                                paymentMode: "Online",
                                tracker: "credit",
                                paymentDate: new Date(),
                            },
                        ],
                        { session }
                    );
                    payments.push(onlinePay);
                }

                payment = payments[0] || null;
            } else {
                const [createdPayment] = await paymentModel.create(
                    [
                        {
                            libraryId: libraryId,
                            student: student._id,
                            feeRecord: feeRecord._id,

                            amount: numericPaidAmount,
                            paymentMode,
                            tracker: "credit",
                            paymentDate: new Date(),
                        },
                    ],
                    { session }
                );

                payment = createdPayment;
                payments = [createdPayment];
            }
        }

        // 12b. CREATE RESERVATION - links this admission to the seat/slot
        // the owner picked on the seat-map screen. seatId is null only if
        // the owner explicitly chose "overbook anyway" when no seat was free.

        const overbooked = !seatId;

        const [reservation] = await reservationModel.create(
            [
                {
                    libraryId,
                    studentId: student._id,
                    slotTemplateId,
                    seatId: seatId || null,

                    startMinute: slotTemplate.startMinute,
                    endMinute: slotTemplate.endMinute,

                    subscriptionStartDate: parsedStartDate,
                    subscriptionExpiryDate: parsedExpireDate,

                    status: overbooked ? "overbooked_pending" : "active",
                    overbooked,
                },
            ],
            { session }
        );

        // 13. COMMIT TRANSACTION
        await session.commitTransaction();

        // [v1.0.1 - 2026-08-12] Populate seatId on newly created student before sending payload
        if (student.seatId) {
            await student.populate("seatId", "label seatNumber");
        }

        return res.status(201).json({
            success: true,
            message: "Student added successfully",

            data: {
                student: attachSignedPhotoUrl(student),
                feeRecord,
                payment,
                payments,
                reservation,
            },
        });
    } catch (error) {
        // -----------------------------------------
        // ROLLBACK
        // -----------------------------------------

        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        // Duplicate key race condition
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A student with this Student ID already exists in this library",
            });
        }

        // Mongoose validation error
        if (error?.name === "ValidationError") {
            const messages = Object.values(error.errors).map(
                (item) => item.message
            );

            return res.status(400).json({
                success: false,
                message: messages[0] || "Validation failed",
                errors: messages,
            });
        }

        console.error("ADD STUDENT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to add student",
        });
    } finally {
        await session.endSession();
    }
};

const getStudents = async (req, res) => {
    try {
        // 1. GET AUTHENTICATED USER
        const userId = req.user.id;

        // 2. GET LIBRARY ID
        const { libraryId } = req.params;

        // 3. GET PAGINATION VALUES
        const page = Math.max(Number(req.query.page) || 1, 1);

        const limit = Math.min(
            Math.max(Number(req.query.limit) || 20, 1),
            100
        );

        const skip = (page - 1) * limit;

        // 4. VALIDATE LIBRARY ID
        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

        // 5. CHECK LIBRARY OWNERSHIP
        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        // 6. FETCH STUDENTS — exclude paused (they appear in Follow Up tab only)
        const students = await studentModel
            .find({
                libraryId: libraryId,
                status: { $ne: 'paused' },
            })
            .populate("seatId", "label seatNumber")
            .sort({
                createdAt: -1,
                _id: -1,
            })
            .skip(skip)
            .limit(limit + 1)
            .lean();


        console.log(students)
        // 7. CHECK IF MORE STUDENTS EXIST
        const hasMore = students.length > limit;

        if (hasMore) {
            students.pop();
        }

        // 8. SEND RESPONSE
        return res.status(200).json({
            success: true,
            message: "Students fetched successfully",
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: {
                    page,
                    limit,
                    hasMore,
                },
            },
        });
    } catch (error) {
        console.error("GET STUDENTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load students",
        });
    }
};

const getActiveStudents = async (req, res) => {
    try {
        console.log('active');
        // 1. GET AUTHENTICATED USER
        const userId = req.user.id;

        // 2. GET LIBRARY ID
        const { libraryId } = req.params;

        // 3. GET PAGINATION VALUES
        const page = Math.max(Number(req.query.page) || 1, 1);

        const limit = Math.min(
            Math.max(Number(req.query.limit) || 20, 1),
            100
        );

        const skip = (page - 1) * limit;

        // 4. VALIDATE LIBRARY ID
        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

        // 5. CHECK LIBRARY OWNERSHIP
        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        // 6. GET START OF TODAY (UTC)
        const today = startOfDay();

        // 7. FETCH ONLY ACTIVE STUDENTS
        const students = await studentModel
            .find({
                libraryId: libraryId,
                status: "active",
                currentExpireDate: {
                    $gte: today,
                },
            })
            .populate("seatId", "label seatNumber")
            .sort({
                createdAt: -1,
                _id: -1,
            })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        // 8. CHECK IF MORE STUDENTS EXIST
        const hasMore = students.length > limit;

        if (hasMore) {
            students.pop();
        }


        // 9. SEND RESPONSE
        return res.status(200).json({
            success: true,
            message: "Active students fetched successfully",
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: {
                    page,
                    limit,
                    hasMore,
                },
            },
        });
    } catch (error) {
        console.error("GET ACTIVE STUDENTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load active students",
        });
    }
};

const getExpiredStudents = async (req, res) => {
    try {
        // 1. GET AUTHENTICATED USER
        const userId = req.user.id;

        // 2. GET LIBRARY ID
        const { libraryId } = req.params;

        // 3. GET QUERY PARAMETERS
        const page = Math.max(Number(req.query.page) || 1, 1);

        const limit = Math.min(
            Math.max(Number(req.query.limit) || 20, 1),
            100
        );

        const startDay = Number(req.query.startDay);
        const endDay = Number(req.query.endDay);

        const skip = (page - 1) * limit;

        // 4. VALIDATE DAY RANGE
        if (
            !Number.isInteger(startDay) ||
            !Number.isInteger(endDay) ||
            startDay < 1 ||
            endDay < startDay
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid startDay or endDay",
            });
        }

        // 5. VALIDATE LIBRARY ID
        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

        // 6. CHECK LIBRARY OWNERSHIP
        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        // 7. GET START OF TODAY (UTC)
        const today = startOfDay();

        // 8. CREATE EXPIRED DATE RANGE (UTC)
        const rangeStart = new Date(today);
        rangeStart.setUTCDate(rangeStart.getUTCDate() - endDay);

        const rangeEnd = new Date(today);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() - startDay);
        rangeEnd.setUTCHours(23, 59, 59, 999);

        // 9. FETCH EXPIRED STUDENTS
        const students = await studentModel
            .find({
                libraryId: libraryId,

                currentExpireDate: {
                    $gte: rangeStart,
                    $lte: rangeEnd,
                },
            })
            .populate("seatId", "label seatNumber")
            .sort({
                currentExpireDate: -1,
                _id: -1,
            })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        // 10. CHECK IF MORE STUDENTS EXIST
        const hasMore = students.length > limit;

        if (hasMore) {
            students.pop();
        }

        // 11. SEND RESPONSE
        return res.status(200).json({
            success: true,
            message: "Expired students fetched successfully",
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: {
                    page,
                    limit,
                    hasMore,
                },
            },
        });
    } catch (error) {
        console.error("GET EXPIRED STUDENTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load expired students",
        });
    }
};

const getExpiringStudents = async (req, res) => {
    try {
        // 1. GET AUTHENTICATED USER
        const userId = req.user.id;

        // 2. GET LIBRARY ID
        const { libraryId } = req.params;

        // 3. GET QUERY PARAMETERS
        const page = Math.max(Number(req.query.page) || 1, 1);

        const limit = Math.min(
            Math.max(Number(req.query.limit) || 20, 1),
            100
        );

        const startDay = Number(req.query.startDay);
        const endDay = Number(req.query.endDay);

        const skip = (page - 1) * limit;

        // 4. VALIDATE DAY RANGE
        if (
            !Number.isInteger(startDay) ||
            !Number.isInteger(endDay) ||
            startDay < 1 ||
            endDay < startDay
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid startDay or endDay",
            });
        }

        // 5. VALIDATE LIBRARY ID
        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

        // 6. CHECK LIBRARY OWNERSHIP
        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        // 7. GET START OF TODAY (UTC)
        const today = startOfDay();

        // 8. CREATE EXPIRING DATE RANGE (UTC)
        const rangeStart = new Date(today);
        const dayOffset = startDay === 1 ? 0 : startDay;
        rangeStart.setUTCDate(rangeStart.getUTCDate() + dayOffset);

        const rangeEnd = new Date(today);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() + endDay);
        rangeEnd.setUTCHours(23, 59, 59, 999);

        // 9. FETCH EXPIRING STUDENTS
        const students = await studentModel
            .find({
                libraryId: libraryId,
                status: "active",
                currentExpireDate: {
                    $gte: rangeStart,
                    $lte: rangeEnd,
                },
            })
            .populate("seatId", "label seatNumber")
            .sort({
                currentExpireDate: 1,
                _id: -1,
            })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        // 10. CHECK IF MORE STUDENTS EXIST
        const hasMore = students.length > limit;

        if (hasMore) {
            students.pop();
        }


        // 11. SEND RESPONSE
        return res.status(200).json({
            success: true,
            message: "Expiring students fetched successfully",
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: {
                    page,
                    limit,
                    hasMore,
                },
            },
        });
    } catch (error) {
        console.error("GET EXPIRING STUDENTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load expiring students",
        });
    }
};

const getPendingStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId } = req.params;

        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(
            Math.max(Number(req.query.limit) || 20, 1),
            100
        );
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        const students = await studentModel
            .find({
                libraryId: libraryId,
                totalPending: { $gt: 0 },
            })
            .populate("seatId", "label seatNumber")
            .sort({
                createdAt: -1,
                _id: -1,
            })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        const hasMore = students.length > limit;
        if (hasMore) {
            students.pop();
        }

        return res.status(200).json({
            success: true,
            message: "Pending students fetched successfully",
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: {
                    page,
                    limit,
                    hasMore,
                },
            },
        });
    } catch (error) {
        console.error("GET PENDING STUDENTS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load pending students",
        });
    }
};


const getStudentSummary = async (req, res) => {
    try {
        // 1. GET LOGGED-IN USER ID
        const userId = req.user.id;

        // 2. GET LIBRARY ID FROM URL
        const { libraryId } = req.params;

        // 3. VALIDATE LIBRARY ID
        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

        // 4. CHECK WHETHER THE USER OWNS THIS LIBRARY
        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        // 5. CREATE TODAY'S START TIME (UTC)
        const today = startOfDay();

        // 6. HELPER FUNCTION TO CREATE DATE BOUNDARIES (UTC)
        const addDays = (days) => {
            const date = new Date(today);
            date.setUTCDate(date.getUTCDate() + days);
            return date;
        };

        // FUTURE DATE BOUNDARIES (1-3, 4-6, 7-10)
        const day1 = addDays(1);
        const day4 = addDays(4);
        const day7 = addDays(7);
        const day11 = addDays(11);

        // PAST DATE BOUNDARIES (1-3, 4-6, 7-10)
        const dayMinus3 = addDays(-3);
        const dayMinus6 = addDays(-6);
        const dayMinus10 = addDays(-10);

        // 7. CONVERT LIBRARY ID TO OBJECT ID
        const libraryObjectId = new mongoose.Types.ObjectId(libraryId);

        // Indian Standard Time (UTC+5:30) today's month & day for birthday check
        const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const currentMonth = nowIST.getMonth() + 1;
        const currentDay = nowIST.getDate();

        // 8. CALCULATE ALL STUDENT COUNTS AND CHECK TODAY BIRTHDAY (EARLY EXIT)
        const [[summary], hasBirthdayStudent] = await Promise.all([
            studentModel.aggregate([
                {
                    $match: {
                        libraryId: libraryObjectId,
                    },
                },

                {
                    $group: {
                        _id: null,

                        // TOTAL PENDING DUE AMOUNT ACROSS ALL STUDENTS
                        totalPendingAmount: {
                            $sum: { $ifNull: ["$totalPending", 0] },
                        },

                        // ALL ACTIVE STUDENTS
                        active: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$status", "active"] },
                                            { $ne: ["$currentExpireDate", null] },
                                            { $gte: ["$currentExpireDate", today] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        // EXPIRING IN 1–3 DAYS (Today + Days 1, 2, 3)
                        expiring1To3Days: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$status", "active"] },
                                            { $ne: ["$currentExpireDate", null] },
                                            { $gte: ["$currentExpireDate", today] },
                                            { $lt: ["$currentExpireDate", day4] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        // EXPIRING IN 4–6 DAYS (Days 4, 5, 6)
                        expiring4To7Days: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$status", "active"] },
                                            { $ne: ["$currentExpireDate", null] },
                                            { $gte: ["$currentExpireDate", day4] },
                                            { $lt: ["$currentExpireDate", day7] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        // EXPIRING IN 7–10 DAYS (Days 7, 8, 9, 10)
                        expiring8To10Days: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$status", "active"] },
                                            { $ne: ["$currentExpireDate", null] },
                                            { $gte: ["$currentExpireDate", day7] },
                                            { $lt: ["$currentExpireDate", day11] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        // EXPIRED 1–3 DAYS AGO (Days 1, 2, 3 ago)
                        expired1To3Days: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ["$status", "blacklisted"] },
                                            { $ne: ["$currentExpireDate", null] },
                                            { $gte: ["$currentExpireDate", dayMinus3] },
                                            { $lt: ["$currentExpireDate", today] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        // EXPIRED 4–6 DAYS AGO (Days 4, 5, 6 ago)
                        expired4To7Days: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ["$status", "blacklisted"] },
                                            { $ne: ["$currentExpireDate", null] },
                                            { $gte: ["$currentExpireDate", dayMinus6] },
                                            { $lt: ["$currentExpireDate", dayMinus3] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        // EXPIRED 7–10 DAYS AGO (Days 7, 8, 9, 10 ago)
                        expired8To10Days: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ["$status", "blacklisted"] },
                                            { $ne: ["$currentExpireDate", null] },
                                            { $gte: ["$currentExpireDate", dayMinus10] },
                                            { $lt: ["$currentExpireDate", dayMinus6] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },
            ]),
            studentModel.findOne({
                libraryId: libraryObjectId,
                dob: { $ne: null },
                $expr: {
                    $and: [
                        { $eq: [{ $month: { date: "$dob", timezone: "Asia/Kolkata" } }, currentMonth] },
                        { $eq: [{ $dayOfMonth: { date: "$dob", timezone: "Asia/Kolkata" } }, currentDay] },
                    ],
                },
            }).select("_id").lean(),
        ]);

        // 9. SEND RESPONSE
        return res.status(200).json({
            success: true,
            message: "Student summary fetched successfully",
            data: {
                active: summary?.active ?? 0,
                hasTodayBirthday: Boolean(hasBirthdayStudent),
                totalPendingAmount: summary?.totalPendingAmount ?? 0,

                expiring: {
                    days1To3: summary?.expiring1To3Days ?? 0,
                    days4To7: summary?.expiring4To7Days ?? 0,
                    days8To10: summary?.expiring8To10Days ?? 0,
                },

                expired: {
                    days1To3: summary?.expired1To3Days ?? 0,
                    days4To7: summary?.expired4To7Days ?? 0,
                    days8To10: summary?.expired8To10Days ?? 0,
                },
            },
        });
    } catch (error) {
        console.error("GET STUDENT SUMMARY ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const updateStudentProfile = async (req, res) => {
    try {
        const student = await updateStudentProfileService({
            userId: req.user.id,
            libraryId: req.params.libraryId,
            studentId: req.params.studentId,
            name: req.body.name,
            phone: req.body.phone,
            idProof: req.body.idProof,
            customStudentId: req.body.studentId !== undefined ? req.body.studentId : req.body.customStudentId,
            guardianName: req.body.guardianName,
            guardianPhone: req.body.guardianPhone,
            dob: req.body.dob,
            address: req.body.address,
        });

        return res.status(200).json({
            success: true,
            message: "Student updated successfully",
            data: {
                student: attachSignedPhotoUrl(student),
            },
        });
    } catch (error) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }

        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A student with this ID or phone number already exists in this library",
            });
        }

        if (error?.name === "ValidationError") {
            const messages = Object.values(error.errors).map(
                (item) => item.message
            );

            return res.status(400).json({
                success: false,
                message: messages[0] || "Validation failed",
                errors: messages,
            });
        }

        console.error("UPDATE STUDENT PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update student",
        });
    }
};

const getNextStudentId = async (req, res) => {
    try {
        const { libraryId } = req.params;
        validateObjectId(libraryId, "Library Id");

        // Single highest student query using numeric index collation
        const lastStudent = await studentModel
            .findOne({
                libraryId,
                studentId: { $exists: true, $ne: null, $ne: "" },
            })
            .sort({ studentId: -1 })
            .collation({ locale: "en_US", numericOrdering: true })
            .select("studentId")
            .lean();

        let nextNum = 1;
        if (lastStudent && lastStudent.studentId) {
            const lastNum = parseInt(String(lastStudent.studentId).replace(/\D/g, ""), 10);
            if (!isNaN(lastNum)) {
                nextNum = lastNum + 1;
            }
        }
        const nextStudentId = String(nextNum).padStart(3, "0");

        return res.status(200).json({
            success: true,
            data: {
                nextStudentId,
            },
        });
    } catch (error) {
        console.error("GET NEXT STUDENT ID ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to calculate next student ID",
        });
    }
};

const checkStudentIdAvailability = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const { studentId, excludeMongoId } = req.query;

        validateObjectId(libraryId, "Library Id");

        if (!studentId || !String(studentId).trim()) {
            return res.status(400).json({
                success: false,
                message: "Student ID is required",
            });
        }

        const trimmedId = String(studentId).trim();
        let searchIds = [trimmedId];
        if (/^\d+$/.test(trimmedId)) {
            const num = parseInt(trimmedId, 10);
            searchIds = [
                String(num),
                String(num).padStart(2, "0"),
                String(num).padStart(3, "0"),
                String(num).padStart(4, "0"),
                trimmedId,
            ];
        }

        const query = {
            libraryId,
            studentId: { $in: searchIds },
        };

        if (excludeMongoId && mongoose.Types.ObjectId.isValid(excludeMongoId)) {
            query._id = { $ne: excludeMongoId };
        }

        const existing = await studentModel.findOne(query).select("_id name studentId").lean();

        if (existing) {
            return res.status(200).json({
                success: true,
                available: false,
                assignedTo: existing.name || "another student",
                message: `Student ID "${trimmedId}" is already assigned to ${existing.name || "another student"}`,
            });
        }

        return res.status(200).json({
            success: true,
            available: true,
            message: `Student ID "${trimmedId}" is available`,
        });
    } catch (error) {
        console.error("CHECK STUDENT ID AVAILABILITY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to check student ID availability",
        });
    }
};

const clearStudentPending = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const { action, amount, paymentMode, cashAmount, onlineAmount, note } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Library ID or Student ID",
            });
        }

        if (!action || !["paid", "discount"].includes(action.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Action must be 'paid' or 'discount'",
            });
        }

        const normalizedAction = action.toLowerCase();

        if (normalizedAction === "paid" && (!paymentMode || !["Cash", "Online", "Both"].includes(paymentMode))) {
            return res.status(400).json({
                success: false,
                message: "Valid payment mode ('Cash', 'Online', or 'Both') is required when marking as paid",
            });
        }

        const library = await libraryModel
            .findOne({ _id: libraryId, ownerId: userId })
            .select("_id");

        if (!library) {
            return res.status(404).json({
                success: false,
                message: "Library not found or access denied",
            });
        }

        session.startTransaction();

        const student = await studentModel
            .findOne({ _id: studentId, libraryId })
            .session(session);

        if (!student) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: "Student not found",
            });
        }

        if (student.totalPending <= 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Student has no pending fees to clear",
            });
        }

        const clearAmount = Number(amount) > 0 ? Math.min(Number(amount), student.totalPending) : student.totalPending;

        let feeRecord = await feeRecordModel
            .findOne({ studentId: student._id, libraryId, pendingAmount: { $gt: 0 } })
            .sort({ createdAt: -1 })
            .session(session);

        if (!feeRecord) {
            feeRecord = await feeRecordModel
                .findOne({ studentId: student._id, libraryId })
                .sort({ createdAt: -1 })
                .session(session);
        }

        let payment = null;
        let payments = [];

        if (normalizedAction === "paid") {
            student.totalPaid += clearAmount;
            student.totalPending = Math.max(0, student.totalPending - clearAmount);
            student.lastPaymentDate = new Date();

            if (feeRecord) {
                feeRecord.paidAmount += clearAmount;
                feeRecord.pendingAmount = Math.max(0, feeRecord.pendingAmount - clearAmount);
                await feeRecord.save({ session });

                if (paymentMode === "Both") {
                    const numericCash = Number(cashAmount) || 0;
                    const numericOnline = Number(onlineAmount) || 0;

                    if (numericCash > 0) {
                        const [cashPay] = await paymentModel.create(
                            [
                                {
                                    libraryId,
                                    student: student._id,
                                    feeRecord: feeRecord._id,
                                    amount: numericCash,
                                    paymentMode: "Cash",
                                    tracker: "credit",
                                    note: note ? String(note).trim() : null,
                                    paymentDate: new Date(),
                                },
                            ],
                            { session }
                        );
                        payments.push(cashPay);
                    }

                    if (numericOnline > 0) {
                        const [onlinePay] = await paymentModel.create(
                            [
                                {
                                    libraryId,
                                    student: student._id,
                                    feeRecord: feeRecord._id,
                                    amount: numericOnline,
                                    paymentMode: "Online",
                                    tracker: "credit",
                                    note: note ? String(note).trim() : null,
                                    paymentDate: new Date(),
                                },
                            ],
                            { session }
                        );
                        payments.push(onlinePay);
                    }

                    payment = payments[0] || null;
                } else {
                    const [createdPayment] = await paymentModel.create(
                        [
                            {
                                libraryId,
                                student: student._id,
                                feeRecord: feeRecord._id,
                                amount: clearAmount,
                                paymentMode,
                                tracker: "credit",
                                note: note ? String(note).trim() : null,
                                paymentDate: new Date(),
                            },
                        ],
                        { session }
                    );
                    payment = createdPayment;
                    payments = [createdPayment];
                }
            }
        } else if (normalizedAction === "discount") {
            student.totalDiscount += clearAmount;
            student.totalPending = Math.max(0, student.totalPending - clearAmount);

            if (feeRecord) {
                feeRecord.discount += clearAmount;
                feeRecord.pendingAmount = Math.max(0, feeRecord.pendingAmount - clearAmount);
                await feeRecord.save({ session });
            }
        }

        await student.save({ session });
        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: `Pending amount of ₹${clearAmount} successfully resolved as ${normalizedAction}`,
            data: {
                student: attachSignedPhotoUrl(student),
                payment,
                payments,
            },
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error("CLEAR STUDENT PENDING ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to clear student pending amount",
        });
    } finally {
        session.endSession();
    }
};

const refundStudent = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const { refundAmount, paymentMode, note, refundEndDate } = req.body;

        // --- VALIDATE IDs ---
        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: "Invalid Library ID or Student ID" });
        }

        // --- VALIDATE REFUND AMOUNT ---
        const numericRefund = Number(refundAmount);
        if (!Number.isFinite(numericRefund) || numericRefund <= 0) {
            return res.status(400).json({ success: false, message: "Refund amount must be greater than 0" });
        }

        // --- VALIDATE PAYMENT MODE ---
        if (!paymentMode || !["Cash", "Online"].includes(paymentMode)) {
            return res.status(400).json({ success: false, message: "Valid payment mode (Cash or Online) is required" });
        }

        // --- CHECK LIBRARY OWNERSHIP ---
        const library = await libraryModel
            .findOne({ _id: libraryId, ownerId: userId })
            .select("_id");

        if (!library) {
            return res.status(403).json({ success: false, message: "Library not found or access denied" });
        }

        session.startTransaction();

        // --- FIND STUDENT ---
        const student = await studentModel
            .findOne({ _id: studentId, libraryId })
            .session(session);

        if (!student) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        // --- VALIDATE: REFUND CANNOT EXCEED WHAT WAS PAID ---
        if (numericRefund > student.totalPaid) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Refund amount cannot exceed total paid (₹${student.totalPaid})`,
            });
        }

        // --- 1. CANCEL ACTIVE RESERVATION (frees seat + slot) ---
        const reservation = await reservationModel.findOneAndUpdate(
            {
                studentId: student._id,
                libraryId,
                status: { $in: ["active", "overbooked_pending"] },
            },
            { status: "cancelled", cancelledAt: new Date() },
            { returnDocument: 'after', session }
        );

        // --- 2. UPDATE FEE RECORD ---
        const feeRecord = await feeRecordModel
            .findOne({ studentId: student._id, libraryId, paidAmount: { $gt: 0 } })
            .sort({ createdAt: -1 })
            .session(session);

        if (feeRecord) {
            feeRecord.refundAmount = (feeRecord.refundAmount || 0) + numericRefund;
            feeRecord.paidAmount = Math.max(0, feeRecord.paidAmount - numericRefund);
            feeRecord.pendingAmount = 0; // reservation cancelled — nothing left to collect
            await feeRecord.save({ session });
        }

        // --- 3. CREATE REFUND PAYMENT RECORD ---
        const [refundPayment] = await paymentModel.create(
            [
                {
                    libraryId,
                    student: student._id,
                    feeRecord: feeRecord?._id || null,
                    amount: numericRefund,
                    paymentMode,
                    tracker: "refund",
                    note: note ? String(note).trim() : null,
                    paymentDate: new Date(),
                },
            ],
            { session }
        );

        // --- 4. UPDATE STUDENT FINANCIALS ---

        // Set expire date to custom refundEndDate if provided, or default to yesterday
        let effectiveExpireDate;
        if (refundEndDate) {
            const dateStr = String(refundEndDate).split('T')[0];
            const parts = dateStr.split('-').map(Number);
            if (parts.length === 3 && !parts.some(isNaN)) {
                const [year, month, day] = parts;
                effectiveExpireDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
            }
        }

        if (!effectiveExpireDate) {
            const yesterday = new Date();
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);
            effectiveExpireDate = endOfDay(yesterday);
        }

        student.totalPaid = Math.max(0, student.totalPaid - numericRefund);
        student.totalPending = 0;    // waived — reservation cancelled
        student.seatId = null;        // seat released
        student.currentExpireDate = effectiveExpireDate; // mark as expired on chosen date
        await student.save({ session });

        await session.commitTransaction();

        const studentObj = student.toObject();
        const [signedStudent] = attachSignedPhotoUrls([studentObj]);

        return res.status(200).json({
            success: true,
            message: `Refund of ₹${numericRefund} processed successfully`,
            data: {
                student: signedStudent,
                refundPayment,
                reservation,
            },
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error("REFUND STUDENT ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to process refund" });
    } finally {
        session.endSession();
    }
};

const renewStudent = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;

        const {
            slotTemplateId,
            seatId,
            currentPlanDays,
            startDate,
            expireDate,
            amount,
            cardFee = 0,
            lockerFee = 0,
            discount = 0,
            paidAmount = 0,
            cashAmount = 0,
            onlineAmount = 0,
            paymentMode,
            notes,
        } = req.body;

        // --- VALIDATE IDs ---
        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid Library ID or Student ID' });
        }

        // --- VALIDATE REQUIRED FIELDS ---
        if (!slotTemplateId || !currentPlanDays || !startDate || !expireDate || amount === undefined) {
            return res.status(400).json({ success: false, message: 'Required fields are missing' });
        }

        // --- PAYMENT MODE REQUIRED IF MONEY PAID ---
        if (Number(paidAmount) > 0 && !paymentMode) {
            return res.status(400).json({ success: false, message: 'Payment mode is required when payment is made' });
        }

        // --- NORMALIZE NUMBERS ---
        const numericPlanDays = Number(currentPlanDays);
        const numericAmount = Number(amount);
        const numericDiscount = Number(discount);
        const numericPaidAmount = Number(paidAmount);

        if (!Number.isFinite(numericPlanDays) || numericPlanDays <= 0) {
            return res.status(400).json({ success: false, message: 'Plan days must be greater than 0' });
        }
        if (!Number.isFinite(numericAmount) || !Number.isFinite(numericDiscount) || !Number.isFinite(numericPaidAmount)) {
            return res.status(400).json({ success: false, message: 'Invalid amount value' });
        }
        if (numericAmount < 0 || numericDiscount < 0 || numericPaidAmount < 0) {
            return res.status(400).json({ success: false, message: 'Amount values cannot be negative' });
        }

        // --- CALCULATE FEE ---
        const finalAmount = numericAmount - numericDiscount;
        if (finalAmount < 0) {
            return res.status(400).json({ success: false, message: 'Discount cannot exceed fee amount' });
        }
        if (numericPaidAmount > finalAmount) {
            return res.status(400).json({ success: false, message: 'Paid amount cannot exceed final amount' });
        }
        const pendingAmount = finalAmount - numericPaidAmount;

        // --- PARSE + VALIDATE DATES ---
        const parsedStartDate = startOfDay(startDate);
        const parsedExpireDate = endOfDay(expireDate);

        if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedExpireDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid start or expire date' });
        }
        if (parsedExpireDate <= parsedStartDate) {
            return res.status(400).json({ success: false, message: 'Expire date must be after start date' });
        }

        // --- VALIDATE SLOT BELONGS TO LIBRARY ---
        validateObjectId(slotTemplateId, 'Slot ID');
        const slotTemplate = await slotTemplateModel
            .findOne({ _id: slotTemplateId, libraryId })
            .select('startMinute endMinute name')
            .lean();

        if (!slotTemplate) {
            return res.status(404).json({ success: false, message: 'Slot not found for this library' });
        }

        // --- CHECK LIBRARY OWNERSHIP ---
        const library = await libraryModel
            .findOne({ _id: libraryId, ownerId: userId })
            .select('_id')
            .lean();

        if (!library) {
            return res.status(403).json({ success: false, message: 'You do not have access to this library' });
        }

        // --- FIND STUDENT ---
        const student = await studentModel.findOne({ _id: studentId, libraryId }).lean();
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (student.status === 'blacklisted') {
            return res.status(400).json({
                success: false,
                message: 'Blacklisted students cannot renew admission. Please unblock the student first.',
            });
        }

        // --- FIND CURRENT ACTIVE RESERVATION ---
        const activeReservation = await reservationModel.findOne({
            studentId: student._id,
            libraryId,
            status: { $in: ['active', 'overbooked_pending'] },
        }).lean();

        session.startTransaction();

        // --- 1. CREATE NEW RESERVATION (renew links to old one via renewalOf) ---
        const overbooked = !seatId;
        let newReservation;

        if (activeReservation) {
            // Use bookingService renewReservation to keep audit trail
            const { renewReservation } = await import('../claude/bookingService.mjs');
            const { reservation, overbookingWarning } = await renewReservation(
                activeReservation._id.toString(),
                parsedStartDate,
                parsedExpireDate
            );
            newReservation = reservation;
        } else {
            // No prior reservation (edge-case) — create fresh
            const [created] = await reservationModel.create(
                [
                    {
                        libraryId,
                        studentId: student._id,
                        slotTemplateId,
                        seatId: seatId || null,
                        startMinute: slotTemplate.startMinute,
                        endMinute: slotTemplate.endMinute,
                        subscriptionStartDate: parsedStartDate,
                        subscriptionExpiryDate: parsedExpireDate,
                        status: overbooked ? 'overbooked_pending' : 'active',
                        overbooked,
                    },
                ],
                { session }
            );
            newReservation = created;
        }

        // --- 2. UPDATE RESERVATION seatId + slotTemplateId if user changed them ---
        // (renewReservation preserves the old values; patch them with the new ones)
        await reservationModel.findByIdAndUpdate(
            newReservation._id,
            {
                seatId: seatId || null,
                slotTemplateId,
                startMinute: slotTemplate.startMinute,
                endMinute: slotTemplate.endMinute,
                status: overbooked ? 'overbooked_pending' : 'active',
                overbooked,
            },
            { session }
        );

        // --- 3. CREATE NEW FEE RECORD ---
        const [feeRecord] = await feeRecordModel.create(
            [
                {
                    libraryId,
                    studentId: student._id,
                    slotId: slotTemplateId,
                    planDays: numericPlanDays,
                    startDate: parsedStartDate,
                    expireDate: parsedExpireDate,
                    amount: numericAmount,
                    cardFee: Number(cardFee) || 0,
                    lockerFee: Number(lockerFee) || 0,
                    discount: numericDiscount,
                    finalAmount,
                    paidAmount: numericPaidAmount,
                    pendingAmount,
                },
            ],
            { session }
        );

        // --- 4. CREATE PAYMENT IF MONEY WAS PAID ---
        let payment = null;
        let payments = [];

        if (numericPaidAmount > 0) {
            if (paymentMode === "Both") {
                let numericOnline = Math.min(Number(onlineAmount) || 0, numericPaidAmount);
                let numericCash = Math.max(0, numericPaidAmount - numericOnline);

                if (numericCash > 0) {
                    const [cashPay] = await paymentModel.create(
                        [
                            {
                                libraryId,
                                student: student._id,
                                feeRecord: feeRecord._id,
                                amount: numericCash,
                                paymentMode: "Cash",
                                paymentDate: new Date(),
                                tracker: 'credit',
                                note: notes?.trim() || null,
                            },
                        ],
                        { session }
                    );
                    payments.push(cashPay);
                }

                if (numericOnline > 0) {
                    const [onlinePay] = await paymentModel.create(
                        [
                            {
                                libraryId,
                                student: student._id,
                                feeRecord: feeRecord._id,
                                amount: numericOnline,
                                paymentMode: "Online",
                                paymentDate: new Date(),
                                tracker: 'credit',
                                note: notes?.trim() || null,
                            },
                        ],
                        { session }
                    );
                    payments.push(onlinePay);
                }

                payment = payments[0] || null;
            } else {
                const [createdPayment] = await paymentModel.create(
                    [
                        {
                            libraryId,
                            student: student._id,
                            feeRecord: feeRecord._id,
                            amount: numericPaidAmount,
                            paymentMode,
                            paymentDate: new Date(),
                            tracker: 'credit',
                            note: notes?.trim() || null,
                        },
                    ],
                    { session }
                );
                payment = createdPayment;
                payments = [createdPayment];
            }
        }

        // --- 5. UPDATE STUDENT DOCUMENT ---
        const updatedStudent = await studentModel.findByIdAndUpdate(
            student._id,
            {
                slotTemplateId,
                slotTiming: formatSlotTiming(slotTemplate.startMinute, slotTemplate.endMinute),
                seatId: seatId || null,
                currentPlanDays: numericPlanDays,
                currentStartDate: parsedStartDate,
                currentExpireDate: parsedExpireDate,
                $inc: {
                    totalPaid: numericPaidAmount,
                    totalDiscount: numericDiscount,
                },
                totalPending: pendingAmount,
                ...(numericPaidAmount > 0 && { lastPaymentDate: new Date() }),
                ...(notes?.trim() && { notes: notes.trim() }),
            },
            { new: true, session }
        );

        await session.commitTransaction();

        // [v1.0.1 - 2026-08-12] Populate seatId on updated student before sending payload
        if (updatedStudent && updatedStudent.seatId) {
            await updatedStudent.populate("seatId", "label seatNumber");
        }

        return res.status(200).json({
            success: true,
            message: 'Admission renewed successfully',
            data: {
                student: attachSignedPhotoUrl(updatedStudent),
                feeRecord,
                payment,
                payments,
                reservation: newReservation,
            },
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        if (error?.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(400).json({ success: false, message: messages[0] || 'Validation failed' });
        }
        console.error('RENEW STUDENT ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to renew admission' });
    } finally {
        session.endSession();
    }
};

const pauseStudent = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid Library ID or Student ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id');
        if (!library) {
            return res.status(403).json({ success: false, message: 'Library not found or access denied' });
        }

        session.startTransaction();

        const student = await studentModel.findOne({ _id: studentId, libraryId }).session(session);
        if (!student) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (student.status === 'paused') {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Student is already paused' });
        }

        // Pause active reservation
        await reservationModel.updateMany(
            { studentId: student._id, libraryId, status: { $in: ['active', 'overbooked_pending'] } },
            { status: 'paused', seatId: null },
            { session }
        );

        student.status = 'paused';
        student.pausedAt = new Date();
        student.pauseReason = reason ? String(reason).trim() : null;
        student.seatId = null; // release seat on pause

        await student.save({ session });
        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: 'Student membership paused successfully',
            data: { student: attachSignedPhotoUrl(student) },
        });
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('PAUSE STUDENT ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to pause student' });
    } finally {
        session.endSession();
    }
};

const resumeStudent = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const { extensionDays, seatId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid Library ID or Student ID' });
        }

        const numericExtensionDays = Number(extensionDays);
        if (!Number.isFinite(numericExtensionDays) || numericExtensionDays < 0) {
            return res.status(400).json({ success: false, message: 'Extension days must be 0 or greater' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id');
        if (!library) {
            return res.status(403).json({ success: false, message: 'Library not found or access denied' });
        }

        session.startTransaction();

        const student = await studentModel.findOne({ _id: studentId, libraryId }).session(session);
        if (!student) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (student.status !== 'paused') {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Student is not currently paused' });
        }

        // Calculate new expiry date by adding extensionDays
        const msToAdd = numericExtensionDays * 24 * 60 * 60 * 1000;
        const currentExpire = student.currentExpireDate ? new Date(student.currentExpireDate) : new Date();
        const newExpireDate = new Date(currentExpire.getTime() + msToAdd);

        const overbooked = !seatId;

        // Find existing paused reservation or create active reservation
        let reservation = await reservationModel.findOne({ studentId: student._id, libraryId, status: 'paused' }).session(session);

        if (reservation) {
            reservation.status = overbooked ? 'overbooked_pending' : 'active';
            reservation.seatId = seatId || null;
            reservation.subscriptionExpiryDate = newExpireDate;
            reservation.overbooked = overbooked;
            await reservation.save({ session });
        } else {
            const slotTemplate = await slotTemplateModel.findById(student.slotTemplateId).lean();
            const [createdRes] = await reservationModel.create(
                [
                    {
                        libraryId,
                        studentId: student._id,
                        slotTemplateId: student.slotTemplateId,
                        seatId: seatId || null,
                        startMinute: slotTemplate ? slotTemplate.startMinute : 0,
                        endMinute: slotTemplate ? slotTemplate.endMinute : 1440,
                        subscriptionStartDate: new Date(),
                        subscriptionExpiryDate: newExpireDate,
                        status: overbooked ? 'overbooked_pending' : 'active',
                        overbooked,
                    },
                ],
                { session }
            );
            reservation = createdRes;
        }

        student.status = 'active';
        student.pausedAt = null;
        student.pauseReason = null;
        student.currentExpireDate = newExpireDate;
        student.seatId = seatId || null;

        await student.save({ session });
        await session.commitTransaction();

        // [v1.0.1 - 2026-08-12] Populate seatId on resumed student before sending payload
        if (student.seatId) {
            await student.populate("seatId", "label seatNumber");
        }

        return res.status(200).json({
            success: true,
            message: 'Student membership resumed successfully',
            data: {
                student: attachSignedPhotoUrl(student),
                reservation,
            },
        });
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('RESUME STUDENT ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to resume student' });
    } finally {
        session.endSession();
    }
};

const blacklistStudent = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid Library ID or Student ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id');
        if (!library) {
            return res.status(403).json({ success: false, message: 'Library not found or access denied' });
        }

        session.startTransaction();

        const student = await studentModel.findOne({ _id: studentId, libraryId }).session(session);
        if (!student) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (student.status === 'blacklisted') {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Student is already blacklisted' });
        }

        // Cancel active reservation
        await reservationModel.updateMany(
            { studentId: student._id, libraryId, status: { $in: ['active', 'overbooked_pending', 'paused'] } },
            { status: 'cancelled', cancelledAt: new Date(), seatId: null },
            { session }
        );

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        student.status = 'blacklisted';
        student.blacklistedAt = new Date();
        student.blacklistReason = reason ? String(reason).trim() : null;
        student.seatId = null;
        student.currentExpireDate = yesterday; // immediately expired

        await student.save({ session });
        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: 'Student blacklisted successfully',
            data: { student: attachSignedPhotoUrl(student) },
        });
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('BLACKLIST STUDENT ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to blacklist student' });
    } finally {
        session.endSession();
    }
};

const unblockStudent = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid Library ID or Student ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id');
        if (!library) {
            return res.status(403).json({ success: false, message: 'Library not found or access denied' });
        }

        session.startTransaction();

        const student = await studentModel.findOne({ _id: studentId, libraryId }).session(session);
        if (!student) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (student.status !== 'blacklisted') {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Student is not currently blacklisted' });
        }

        student.status = 'active';
        student.blacklistedAt = null;
        student.blacklistReason = null;
        student.seatId = null; // seat stays null

        await student.save({ session });
        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: 'Student unblocked successfully',
            data: { student: attachSignedPhotoUrl(student) },
        });
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('UNBLOCK STUDENT ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to unblock student' });
    } finally {
        session.endSession();
    }
};

const deleteStudent = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid Library ID or Student ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id');
        if (!library) {
            return res.status(403).json({ success: false, message: 'Library not found or access denied' });
        }

        session.startTransaction();

        const student = await studentModel.findOne({ _id: studentId, libraryId }).session(session);
        if (!student) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Cancel active/paused reservations to free seat
        await reservationModel.updateMany(
            { studentId: student._id, libraryId, status: { $in: ['active', 'overbooked_pending', 'paused'] } },
            { status: 'cancelled', cancelledAt: new Date(), seatId: null },
            { session }
        );

        // Delete profile photo from Cloudinary if it exists
        if (student.photoPublicId && student.photoPublicId.trim() !== "") {
            try {
                await cloudinary.uploader.destroy(student.photoPublicId, {
                    type: "authenticated",
                    invalidate: true,
                });
            } catch (imgError) {
                console.error("Cloudinary Image Delete Error:", imgError);
            }
        }

        // Remove student document
        await studentModel.deleteOne({ _id: student._id, libraryId }).session(session);

        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: 'Student deleted successfully',
        });
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('DELETE STUDENT ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to delete student' });
    } finally {
        session.endSession();
    }
};

const globalSearchStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId } = req.params;
        const query = req.query.query ? req.query.query.trim() : "";

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

        const library = await libraryModel
            .findOne({
                _id: libraryId,
                ownerId: userId,
            })
            .select("_id")
            .lean();

        if (!library) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this library",
            });
        }

        if (!query) {
            return res.status(200).json({
                success: true,
                message: "Search query empty",
                data: { students: [] },
            });
        }

        const cleanPhoneQuery = query.replace(/\D/g, "");
        const orConditions = [
            { name: { $regex: query, $options: "i" } },
        ];

        if (cleanPhoneQuery.length >= 2) {
            orConditions.push({ phone: { $regex: cleanPhoneQuery, $options: "i" } });
        } else {
            orConditions.push({ phone: { $regex: query, $options: "i" } });
        }

        const trimmedQuery = query.trim();
        if (/^\d+$/.test(trimmedQuery)) {
            const numVal = parseInt(trimmedQuery, 10);
            const searchIds = [
                trimmedQuery,
                String(numVal),
                String(numVal).padStart(2, "0"),
                String(numVal).padStart(3, "0"),
                String(numVal).padStart(4, "0"),
            ];
            orConditions.push({ studentId: { $in: searchIds } });
        } else if (trimmedQuery.length > 0) {
            orConditions.push({ studentId: { $regex: trimmedQuery, $options: "i" } });
        }

        const students = await studentModel
            .find({
                libraryId: libraryId,
                $or: orConditions,
            })
            .populate("seatId", "label seatNumber")
            .sort({ name: 1 })
            .limit(50)
            .lean();

        return res.status(200).json({
            success: true,
            message: "Search completed successfully",
            data: {
                students: attachSignedPhotoUrls(students),
            },
        });
    } catch (error) {
        console.error("GLOBAL SEARCH ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to search students",
        });
    }
};

const getStudentFeeRecords = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid Library ID or Student ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id');
        if (!library) {
            return res.status(403).json({ success: false, message: 'Library not found or access denied' });
        }

        const feeRecords = await feeRecordModel.find({ libraryId, studentId }).sort({ createdAt: -1 }).lean();

        for (const record of feeRecords) {
            const payments = await paymentModel.find({ feeRecord: record._id }).sort({ createdAt: 1 }).lean();
            const creditPayments = payments.filter(p => p.tracker === 'credit');

            let canEditPayment = true;
            let blockReason = null;

            if (creditPayments.length > 2) {
                canEditPayment = false;
                blockReason = "Cannot edit: Multiple payments exist for this admission.";
            } else if (creditPayments.length === 2) {
                const d1 = new Date(creditPayments[0].paymentDate || creditPayments[0].createdAt);
                const d2 = new Date(creditPayments[1].paymentDate || creditPayments[1].createdAt);
                const isSameDate = d1.getFullYear() === d2.getFullYear() &&
                                   d1.getMonth() === d2.getMonth() &&
                                   d1.getDate() === d2.getDate();
                if (!isSameDate) {
                    canEditPayment = false;
                    blockReason = "Cannot edit: Payments were made on different dates.";
                }
            }

            let totalCash = 0;
            let totalOnline = 0;
            for (const p of creditPayments) {
                if (p.paymentMode === "Cash") totalCash += (p.amount || 0);
                if (p.paymentMode === "Online") totalOnline += (p.amount || 0);
            }

            if (totalCash > 0 && totalOnline > 0) {
                record.paymentMode = "Both";
            } else if (totalOnline > 0) {
                record.paymentMode = "Online";
            } else {
                record.paymentMode = "Cash";
            }

            record.canEditPayment = canEditPayment;
            record.paymentBlockReason = blockReason;
            record.cashAmount = totalCash;
            record.onlineAmount = totalOnline;
        }

        return res.status(200).json({
            success: true,
            message: 'Fee records fetched successfully',
            data: { feeRecords },
        });
    } catch (error) {
        console.error('GET STUDENT FEE RECORDS ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to fetch fee records' });
    }
};

// [v1.0.1 - 2026-08-12] GET PAUSED STUDENTS — Follow Up tab
const getPausedStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId } = req.params;

        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: 'Invalid library ID' });
        }

        const library = await libraryModel
            .findOne({ _id: libraryId, ownerId: userId })
            .select('_id')
            .lean();

        if (!library) {
            return res.status(403).json({ success: false, message: 'You do not have access to this library' });
        }

        const students = await studentModel
            .find({ libraryId, status: 'paused' })
            .populate('seatId', 'label seatNumber')
            .sort({ pausedAt: -1, createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        const hasMore = students.length > limit;
        if (hasMore) students.pop();

        return res.status(200).json({
            success: true,
            message: 'Paused students fetched successfully',
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: { page, limit, hasMore },
            },
        });
    } catch (error) {
        console.error('GET PAUSED STUDENTS ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to load paused students' });
    }
};

// [v1.0.2 - 2026-08-12] SET FOLLOW UP
const setStudentFollowUp = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const { note, followUpDate } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        if (!followUpDate) {
            return res.status(400).json({ success: false, message: 'Follow-up date is required' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id').lean();
        if (!library) return res.status(403).json({ success: false, message: 'Access denied' });

        const student = await studentModel.findOne({ _id: studentId, libraryId }).populate('seatId', 'label seatNumber');
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        student.followUpNote = note?.trim() || null;
        student.followUpDate = new Date(followUpDate);
        student.followUpSetAt = new Date();
        await student.save();

        return res.status(200).json({
            success: true,
            message: 'Follow-up saved',
            data: { student: attachSignedPhotoUrls([student.toObject()])[0] },
        });
    } catch (error) {
        console.error('SET FOLLOW UP ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to save follow-up' });
    }
};

// [v1.0.2 - 2026-08-12] CLEAR FOLLOW UP
const clearStudentFollowUp = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id').lean();
        if (!library) return res.status(403).json({ success: false, message: 'Access denied' });

        const student = await studentModel.findOne({ _id: studentId, libraryId }).populate('seatId', 'label seatNumber');
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        student.followUpNote = null;
        student.followUpDate = null;
        student.followUpSetAt = null;
        await student.save();

        return res.status(200).json({
            success: true,
            message: 'Follow-up cleared',
            data: { student: attachSignedPhotoUrls([student.toObject()])[0] },
        });
    } catch (error) {
        console.error('CLEAR FOLLOW UP ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to clear follow-up' });
    }
};

// [v1.0.2 - 2026-08-12] GET FOLLOW UP STUDENTS (paused + expired with follow-up date)
const getFollowUpStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId } = req.params;

        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: 'Invalid library ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id').lean();
        if (!library) return res.status(403).json({ success: false, message: 'Access denied' });

        const students = await studentModel
            .find({
                libraryId,
                $or: [
                    { status: 'paused' },
                    { followUpDate: { $ne: null } },
                ],
            })
            .populate('seatId', 'label seatNumber')
            .sort({ status: -1, followUpDate: 1, pausedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        const hasMore = students.length > limit;
        if (hasMore) students.pop();

        return res.status(200).json({
            success: true,
            message: 'Follow-up students fetched successfully',
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: { page, limit, hasMore },
            },
        });
    } catch (error) {
        console.error('GET FOLLOW UP STUDENTS ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to load follow-up students' });
    }
};

// ==========================================
// EDIT STUDENT ADMISSION (Atomic Correction) [v1.0.2 - 2026-08-12]
// ==========================================
const editStudentAdmission = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const {
            seatId,
            slotTemplateId,
            startDate,
            expireDate,
            planDays,
            amount,
            discount,
            paidAmount,
            pendingAmount,
            paymentMode,
            note,
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid IDs' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).session(session);
        if (!library) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const student = await studentModel.findOne({ _id: studentId, libraryId }).session(session);
        if (!student) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Capture initial values to detect changes
        const oldStartMs = student.currentStartDate ? new Date(student.currentStartDate).getTime() : 0;
        const oldExpireMs = student.currentExpireDate ? new Date(student.currentExpireDate).getTime() : 0;
        const oldSeatId = String(student.seatId || '');
        const oldSlotTemplateId = String(student.slotTemplateId || '');

        // 1. Update Student Financials & Dates & Seat/Slot
        const numPaid = Number(paidAmount) >= 0 ? Number(paidAmount) : student.totalPaid;
        const numPending = Number(pendingAmount) >= 0 ? Number(pendingAmount) : 0;
        const numDiscount = Number(discount) >= 0 ? Number(discount) : (student.totalDiscount || 0);
        const numPlanDays = Number(planDays) > 0 ? Number(planDays) : student.currentPlanDays;

        student.totalPaid = numPaid;
        student.totalPending = numPending;
        student.totalDiscount = numDiscount;
        student.currentPlanDays = numPlanDays;

        if (startDate) {
            const d = new Date(startDate);
            if (!isNaN(d.getTime())) student.currentStartDate = d;
        }
        if (expireDate) {
            const dateStr = String(expireDate).split('T')[0];
            const parts = dateStr.split('-').map(Number);
            if (parts.length === 3 && !parts.some(isNaN)) {
                student.currentExpireDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
            } else {
                const d = new Date(expireDate);
                if (!isNaN(d.getTime())) student.currentExpireDate = d;
            }
        }

        if (slotTemplateId && mongoose.Types.ObjectId.isValid(slotTemplateId)) {
            student.slotTemplateId = slotTemplateId;
            const slotTpl = await slotTemplateModel.findById(slotTemplateId).session(session);
            if (slotTpl) {
                student.slotTiming = formatSlotTiming(slotTpl.startMinute, slotTpl.endMinute);
            }
        }

        if (seatId !== undefined && seatId !== null) {
            if (mongoose.Types.ObjectId.isValid(seatId)) {
                student.seatId = seatId;
            }
        }

        await student.save({ session });

        // 2. Update Latest FeeRecord
        const feeRecord = await feeRecordModel.findOne({ studentId, libraryId }).sort({ createdAt: -1 }).session(session);
        if (feeRecord) {
            if (startDate) feeRecord.startDate = new Date(startDate);
            if (expireDate) feeRecord.expireDate = student.currentExpireDate;
            if (planDays) feeRecord.planDays = numPlanDays;
            if (amount !== undefined) feeRecord.amount = Number(amount);
            feeRecord.discount = numDiscount;
            feeRecord.paidAmount = numPaid;
            feeRecord.pendingAmount = numPending;
            feeRecord.finalAmount = (Number(amount) || feeRecord.amount) - numDiscount;
            await feeRecord.save({ session });
        }

        // 3. Update Latest Payment Record(s)
        if (feeRecord) {
            const existingPayments = await paymentModel.find({ feeRecord: feeRecord._id, tracker: 'credit' }).session(session);

            if (paymentMode === "Both") {
                const reqBody = req.body;
                let numOnline = Math.min(Number(reqBody.onlineAmount) || 0, numPaid);
                let numCash = Math.max(0, numPaid - numOnline);

                let cashPay = existingPayments.find(p => p.paymentMode === "Cash");
                let onlinePay = existingPayments.find(p => p.paymentMode === "Online");

                if (numCash > 0) {
                    if (cashPay) {
                        cashPay.amount = numCash;
                        if (note !== undefined) cashPay.note = note;
                        await cashPay.save({ session });
                    } else {
                        await paymentModel.create([{
                            libraryId,
                            student: studentId,
                            feeRecord: feeRecord._id,
                            amount: numCash,
                            paymentMode: "Cash",
                            tracker: "credit",
                            note: note || null
                        }], { session });
                    }
                } else if (cashPay) {
                    await paymentModel.deleteOne({ _id: cashPay._id }).session(session);
                }

                if (numOnline > 0) {
                    if (onlinePay) {
                        onlinePay.amount = numOnline;
                        if (note !== undefined) onlinePay.note = note;
                        await onlinePay.save({ session });
                    } else {
                        await paymentModel.create([{
                            libraryId,
                            student: studentId,
                            feeRecord: feeRecord._id,
                            amount: numOnline,
                            paymentMode: "Online",
                            tracker: "credit",
                            note: note || null
                        }], { session });
                    }
                } else if (onlinePay) {
                    await paymentModel.deleteOne({ _id: onlinePay._id }).session(session);
                }
            } else if (paymentMode === "Cash" || paymentMode === "Online") {
                if (existingPayments.length > 0) {
                    const primary = existingPayments[0];
                    primary.amount = numPaid;
                    primary.paymentMode = paymentMode;
                    if (note !== undefined) primary.note = note;
                    await primary.save({ session });

                    for (let i = 1; i < existingPayments.length; i++) {
                        await paymentModel.deleteOne({ _id: existingPayments[i]._id }).session(session);
                    }
                } else if (numPaid > 0) {
                    await paymentModel.create([{
                        libraryId,
                        student: studentId,
                        feeRecord: feeRecord._id,
                        amount: numPaid,
                        paymentMode: paymentMode,
                        tracker: "credit",
                        note: note || null
                    }], { session });
                }
            }
        }

        // 4. Update Reservation ONLY if Seat, Slot, or Subscription Dates changed
        const newStartMs = student.currentStartDate ? new Date(student.currentStartDate).getTime() : 0;
        const newExpireMs = student.currentExpireDate ? new Date(student.currentExpireDate).getTime() : 0;
        const newSeatId = String(student.seatId || '');
        const newSlotTemplateId = String(student.slotTemplateId || '');

        const seatChanged = newSeatId !== oldSeatId;
        const slotChanged = newSlotTemplateId !== oldSlotTemplateId;
        const datesChanged = (newStartMs !== oldStartMs) || (newExpireMs !== oldExpireMs);

        if (seatChanged || slotChanged || datesChanged) {
            const reservation = await reservationModel.findOne({ studentId, status: 'active' }).session(session);
            if (reservation) {
                if (slotChanged) {
                    reservation.slotTemplateId = slotTemplateId;
                    const slotTpl = await slotTemplateModel.findById(slotTemplateId).session(session);
                    if (slotTpl) {
                        reservation.startMinute = slotTpl.startMinute;
                        reservation.endMinute = slotTpl.endMinute;
                    }
                }
                if (seatChanged) {
                    reservation.seatId = student.seatId;
                }
                if (datesChanged) {
                    reservation.subscriptionStartDate = student.currentStartDate;
                    reservation.subscriptionExpiryDate = student.currentExpireDate;
                }
                await reservation.save({ session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        // Return populated student
        const populatedStudent = await studentModel.findById(studentId)
            .populate('seatId', 'label seatNumber')
            .populate('slotTemplateId', 'name startMinute endMinute')
            .lean();

        return res.status(200).json({
            success: true,
            message: 'Admission details updated successfully',
            data: { student: attachSignedPhotoUrls([populatedStudent])[0] },
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('EDIT ADMISSION ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to update admission details' });
    }
};

/**
 * GET TODAY'S BIRTHDAY STUDENTS
 * Returns students whose date of birth (month and day) is TODAY (IST)
 */
const getTodayBirthdayStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId } = req.params;

        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: 'Invalid library ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id').lean();
        if (!library) return res.status(403).json({ success: false, message: 'Access denied' });

        // Calculate today's day and month in Indian Standard Time (UTC+5:30)
        const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const currentMonth = nowIST.getMonth() + 1; // 1-12
        const currentDay = nowIST.getDate();        // 1-31

        const students = await studentModel
            .find({
                libraryId,
                dob: { $ne: null },
                $expr: {
                    $and: [
                        { $eq: [{ $month: { date: "$dob", timezone: "Asia/Kolkata" } }, currentMonth] },
                        { $eq: [{ $dayOfMonth: { date: "$dob", timezone: "Asia/Kolkata" } }, currentDay] },
                    ],
                },
            })
            .populate('seatId', 'label seatNumber')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        const hasMore = students.length > limit;
        if (hasMore) students.pop();

        return res.status(200).json({
            success: true,
            message: 'Birthday students fetched successfully',
            data: {
                students: attachSignedPhotoUrls(students),
                pagination: { page, limit, hasMore },
            },
        });
    } catch (error) {
        console.error('GET TODAY BIRTHDAY STUDENTS ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to load birthday students' });
    }
};

/**
 * GET BOOK ISSUED STUDENTS
 * Returns students who currently have unreturned books (status: 'issued')
 * with attached book information.
 */
const getBookIssuedStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const { libraryId } = req.params;

        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: 'Invalid library ID' });
        }

        const library = await libraryModel.findOne({ _id: libraryId, ownerId: userId }).select('_id').lean();
        if (!library) return res.status(403).json({ success: false, message: 'Access denied' });

        const activeIssues = await bookIssueModel
            .find({
                libraryId,
                status: 'issued',
            })
            .populate({
                path: 'studentId',
                populate: { path: 'seatId', select: 'label seatNumber' },
            })
            .populate('bookId', 'name category copies availableCopies rentPrice')
            .sort({ issueDate: -1 })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        const hasMore = activeIssues.length > limit;
        if (hasMore) activeIssues.pop();

        // Transform each issue into a student record with book metadata attached
        const studentList = activeIssues
            .filter(issue => issue.studentId != null)
            .map(issue => {
                const student = issue.studentId;
                return {
                    ...student,
                    bookIssueId: issue._id,
                    issuedBookName: issue.bookId?.name || 'Unknown Book',
                    bookIssueDate: issue.issueDate,
                    bookDueDate: issue.dueDate,
                    bookRentPrice: issue.rentPrice,
                };
            });

        return res.status(200).json({
            success: true,
            message: 'Book issued students fetched successfully',
            data: {
                students: attachSignedPhotoUrls(studentList),
                pagination: { page, limit, hasMore },
            },
        });
    } catch (error) {
        console.error('GET BOOK ISSUED STUDENTS ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to load book issued students' });
    }
};

export { addStudent, getStudents, getStudentSummary, getActiveStudents, getExpiredStudents, getExpiringStudents, getPendingStudents, getPausedStudents, getFollowUpStudents, getTodayBirthdayStudents, getBookIssuedStudents, setStudentFollowUp, clearStudentFollowUp, updateStudentProfile, clearStudentPending, refundStudent, renewStudent, pauseStudent, resumeStudent, blacklistStudent, unblockStudent, deleteStudent, globalSearchStudents, getStudentFeeRecords, getNextStudentId, checkStudentIdAvailability, editStudentAdmission }



