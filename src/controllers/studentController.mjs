import mongoose from "mongoose";
import { studentModel } from "../models/studentModel.mjs";
import { feeRecordModel } from "../models/feeRecordModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { reservationModel } from "../claude/ReservationModel.mjs";
import { slotTemplateModel } from "../claude/SlotTemplateModel.mjs";
import { validateObjectId } from "../helper/validatorHelper.mjs";
import { updateStudentProfileService } from "../services/studentService.mjs";

import cloudinary from "../../config/cloudinary.mjs";

function startOfDay(dateInput) {
    if (!dateInput) return new Date();
    const d = new Date(dateInput);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(dateInput) {
    if (!dateInput) return new Date();
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
            slotTemplateId,
            seatId,
            name,
            phone,
            idProof,
            photoPublicId,
            currentPlanDays,
            startDate,
            expireDate,
            amount,
            discount = 0,
            paidAmount = 0,
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

        // 8. CHECK DUPLICATE STUDENT

        //i willthink about it to check or no ---- im not sure
        const existingStudent = await studentModel.findOne({
            libraryId: libraryId,
            phone: normalizedPhone,
        })
            .select("_id")
            .lean();

        if (existingStudent) {
            return res.status(409).json({
                success: false,
                message: "Student with this phone number already exists",
            });
        }


        // 9. START TRANSACTION

        session.startTransaction();

        // 10. CREATE STUDENT

        const [student] = await studentModel.create(
            [
                {
                    libraryId: libraryId,
                    slotTemplateId: slotTemplateId,
                    slotTiming: formatSlotTiming(slotTemplate.startMinute, slotTemplate.endMinute),
                    seatId: seatId,

                    name: normalizedName,
                    phone: normalizedPhone,

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

        if (numericPaidAmount > 0) {
            const [createdPayment] = await paymentModel.create(
                [
                    {
                        libraryId: libraryId,
                        student: student._id,
                        feeRecord: feeRecord._id,

                        amount: numericPaidAmount,
                        paymentMode,
                        paymentDate: new Date(),
                    },
                ],
                { session }
            );

            payment = createdPayment;
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

        return res.status(201).json({
            success: true,
            message: "Student added successfully",

            data: {
                student: attachSignedPhotoUrl(student),
                feeRecord,
                payment,
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

        // Duplicate phone race condition
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Student with this phone number already exists",
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

        // 6. FETCH STUDENTS
        const students = await studentModel
            .find({
                libraryId: libraryId,
            })
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

        // 6. GET START OF TODAY
        const today = new Date();

        today.setHours(0, 0, 0, 0);

        // 7. FETCH ONLY ACTIVE STUDENTS
        const students = await studentModel
            .find({
                libraryId: libraryId,
                status: "active",
                currentExpireDate: {
                    $gte: today,
                },
            })
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

        // 7. GET START OF TODAY
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 8. CREATE EXPIRED DATE RANGE

        // Example:
        // Today = 8 July
        // startDay = 1 → 7 July
        // endDay = 3   → 5 July

        const rangeStart = new Date(today);
        rangeStart.setDate(rangeStart.getDate() - endDay);
        rangeStart.setHours(0, 0, 0, 0);

        const rangeEnd = new Date(today);
        rangeEnd.setDate(rangeEnd.getDate() - startDay);
        rangeEnd.setHours(23, 59, 59, 999);

        // 9. FETCH EXPIRED STUDENTS
        const students = await studentModel
            .find({
                libraryId: libraryId,

                currentExpireDate: {
                    $gte: rangeStart,
                    $lte: rangeEnd,
                },
            })
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

        // 7. GET START OF TODAY
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 8. CREATE EXPIRING DATE RANGE
        //
        // Example:
        // Today = 8 July
        // startDay = 1 → 9 July
        // endDay = 3   → 11 July

        const rangeStart = new Date(today);
        rangeStart.setDate(rangeStart.getDate() + startDay);
        rangeStart.setHours(0, 0, 0, 0);

        const rangeEnd = new Date(today);
        rangeEnd.setDate(rangeEnd.getDate() + endDay);
        rangeEnd.setHours(23, 59, 59, 999);

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

        // 5. CREATE TODAY'S START TIME
        const today = new Date();

        today.setHours(0, 0, 0, 0);

        // 6. HELPER FUNCTION TO CREATE DATE BOUNDARIES
        const addDays = (days) => {
            const date = new Date(today);

            date.setDate(date.getDate() + days);

            return date;
        };

        // FUTURE DATE BOUNDARIES
        const day1 = addDays(1);
        const day4 = addDays(4);
        const day8 = addDays(8);
        const day11 = addDays(11);

        // PAST DATE BOUNDARIES
        const dayMinus3 = addDays(-3);
        const dayMinus7 = addDays(-7);
        const dayMinus10 = addDays(-10);

        // 7. CONVERT LIBRARY ID TO OBJECT ID
        const libraryObjectId = new mongoose.Types.ObjectId(libraryId);

        // 8. CALCULATE ALL STUDENT COUNTS IN ONE DATABASE QUERY
        const [summary] = await studentModel.aggregate([
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

                    // EXPIRING IN 1–3 DAYS
                    expiring1To3Days: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "active"] },
                                        { $ne: ["$currentExpireDate", null] },
                                        { $gte: ["$currentExpireDate", day1] },
                                        { $lt: ["$currentExpireDate", day4] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    // EXPIRING IN 4–7 DAYS
                    expiring4To7Days: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "active"] },
                                        { $ne: ["$currentExpireDate", null] },
                                        { $gte: ["$currentExpireDate", day4] },
                                        { $lt: ["$currentExpireDate", day8] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    // EXPIRING IN 8–10 DAYS
                    expiring8To10Days: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "active"] },
                                        { $ne: ["$currentExpireDate", null] },
                                        { $gte: ["$currentExpireDate", day8] },
                                        { $lt: ["$currentExpireDate", day11] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    // EXPIRED 1–3 DAYS AGO
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

                    // EXPIRED 4–7 DAYS AGO
                    expired4To7Days: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$status", "blacklisted"] },
                                        { $ne: ["$currentExpireDate", null] },
                                        { $gte: ["$currentExpireDate", dayMinus7] },
                                        { $lt: ["$currentExpireDate", dayMinus3] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    // EXPIRED 8–10 DAYS AGO
                    expired8To10Days: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$status", "blacklisted"] },
                                        { $ne: ["$currentExpireDate", null] },
                                        { $gte: ["$currentExpireDate", dayMinus10] },
                                        { $lt: ["$currentExpireDate", dayMinus7] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]);

        // 9. SEND RESPONSE
        return res.status(200).json({
            success: true,
            message: "Student summary fetched successfully",
            data: {
                active: summary?.active ?? 0,
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
                message: "Student with this phone number already exists",
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

const clearStudentPending = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const userId = req.user.id;
        const { libraryId, studentId } = req.params;
        const { action, amount, paymentMode, note } = req.body;

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

        if (normalizedAction === "paid" && (!paymentMode || !["Cash", "Online"].includes(paymentMode))) {
            return res.status(400).json({
                success: false,
                message: "Valid payment mode ('Cash' or 'Online') is required when marking as paid",
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

        if (normalizedAction === "paid") {
            student.totalPaid += clearAmount;
            student.totalPending = Math.max(0, student.totalPending - clearAmount);
            student.lastPaymentDate = new Date();

            if (feeRecord) {
                feeRecord.paidAmount += clearAmount;
                feeRecord.pendingAmount = Math.max(0, feeRecord.pendingAmount - clearAmount);
                await feeRecord.save({ session });

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
        const { refundAmount, paymentMode, note } = req.body;

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

        const oneDayMs = 24 * 60 * 60 * 1000;
        const yesterday = new Date(Date.now() - oneDayMs);

        student.totalPaid = Math.max(0, student.totalPaid - numericRefund);
        student.totalPending = 0;    // waived — reservation cancelled
        student.seatId = null;        // seat released
        student.currentExpireDate = yesterday; // mark as expired immediately
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
            discount = 0,
            paidAmount = 0,
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
        if (numericPaidAmount > 0) {
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

        return res.status(200).json({
            success: true,
            message: 'Admission renewed successfully',
            data: {
                student: attachSignedPhotoUrl(updatedStudent),
                feeRecord,
                payment,
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

export { addStudent, getStudents, getStudentSummary, getActiveStudents, getExpiredStudents, getExpiringStudents, getPendingStudents, updateStudentProfile, clearStudentPending, refundStudent, renewStudent, pauseStudent, resumeStudent, blacklistStudent, unblockStudent, deleteStudent }


