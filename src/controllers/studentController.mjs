import mongoose from "mongoose";
import { studentModel } from "../models/studentModel.mjs";
import { feeRecordModel } from "../models/feeRecordModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { reservationModel } from "../claude/ReservationModel.mjs";
import { slotTemplateModel } from "../claude/SlotTemplateModel.mjs";
import { validateObjectId } from "../helper/validatorHelper.mjs";
import { updateStudentProfileService } from "../services/studentService.mjs";

function startOfDay(date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
}

function endOfDay(date) {
    const normalized = new Date(date);
    normalized.setHours(23, 59, 59, 999);
    return normalized;
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
                    seatId: seatId,

                    name: normalizedName,
                    phone: normalizedPhone,

                    idProof: idProof?.trim() || null,

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
                student,
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
                students,
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
                students,
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
                students,
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
                students,
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
                    currentExpireDate: {
                        $ne: null,
                    },
                },
            },

            {
                $group: {
                    _id: null,

                    // ALL ACTIVE STUDENTS
                    active: {
                        $sum: {
                            $cond: [
                                {
                                    $gte: [
                                        "$currentExpireDate",
                                        today,
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
                                        {
                                            $gte: [
                                                "$currentExpireDate",
                                                day1,
                                            ],
                                        },
                                        {
                                            $lt: [
                                                "$currentExpireDate",
                                                day4,
                                            ],
                                        },
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
                                        {
                                            $gte: [
                                                "$currentExpireDate",
                                                day4,
                                            ],
                                        },
                                        {
                                            $lt: [
                                                "$currentExpireDate",
                                                day8,
                                            ],
                                        },
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
                                        {
                                            $gte: [
                                                "$currentExpireDate",
                                                day8,
                                            ],
                                        },
                                        {
                                            $lt: [
                                                "$currentExpireDate",
                                                day11,
                                            ],
                                        },
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
                                        {
                                            $gte: [
                                                "$currentExpireDate",
                                                dayMinus3,
                                            ],
                                        },
                                        {
                                            $lt: [
                                                "$currentExpireDate",
                                                today,
                                            ],
                                        },
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
                                        {
                                            $gte: [
                                                "$currentExpireDate",
                                                dayMinus7,
                                            ],
                                        },
                                        {
                                            $lt: [
                                                "$currentExpireDate",
                                                dayMinus3,
                                            ],
                                        },
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
                                        {
                                            $gte: [
                                                "$currentExpireDate",
                                                dayMinus10,
                                            ],
                                        },
                                        {
                                            $lt: [
                                                "$currentExpireDate",
                                                dayMinus7,
                                            ],
                                        },
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
                student,
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

export { addStudent, getStudents, getStudentSummary, getActiveStudents, getExpiredStudents, getExpiringStudents, updateStudentProfile }
