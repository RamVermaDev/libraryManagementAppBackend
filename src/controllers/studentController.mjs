import mongoose from "mongoose";
import { studentModel } from "../models/studentModel.mjs";
import { feeRecordModel } from "../models/feeRecordModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";

const addStudent = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const userId = req.user.id

        const {
            libraryId,
            name,
            phone,
            idProof,
            planId,
            programDays,
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

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library ID",
            });
        }

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
        // 1. VALIDATE REQUIRED FIELDS

        if (
            !name ||
            !phone ||
            !planId ||
            !programDays ||
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

        const numericProgramDays = Number(programDays);
        const numericAmount = Number(amount);
        const numericDiscount = Number(discount);
        const numericPaidAmount = Number(paidAmount);

        const parsedStartDate = new Date(startDate);
        const parsedExpireDate = new Date(expireDate);

        console.log(startDate);
        console.log(parsedStartDate);
        console.log(parsedStartDate.toISOString());


        // 3. VALIDATE NUMBERS
        if (
            !Number.isFinite(numericProgramDays) ||
            numericProgramDays <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Program days must be greater than 0",
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


        // 6. VALIDATE OBJECT IDS

        //this will be done later
        // if (!mongoose.Types.ObjectId.isValid(planId)) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Invalid plan ID",
        //     });
        // }


        // 7. CHECK PLAN

        //this will again done later
        // const plan = await Plan.findOne({
        //     _id: planId,
        //     library: libraryId,
        // }).lean();

        // if (!plan) {
        //     return res.status(404).json({
        //         success: false,
        //         message: "Plan not found",
        //     });
        // }


        // 8. CHECK DUPLICATE STUDENT

        //i willthink about it to check or no ---- im not sure
        const existingStudent = await studentModel.findOne({
            library: libraryId,
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
                    library: libraryId,

                    name: normalizedName,
                    phone: normalizedPhone,

                    idProof: idProof?.trim() || null,

                    joiningDate: parsedStartDate,

                    currentPlan: planId,
                    currentProgramDays: numericProgramDays,
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
                    library: libraryId,
                    student: student._id,
                    plan: planId,

                    programDays: numericProgramDays,

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
                        library: libraryId,
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

        // 13. COMMIT TRANSACTION

        await session.commitTransaction();

        return res.status(201).json({
            success: true,
            message: "Student added successfully",

            data: {
                student,
                feeRecord,
                payment,
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
                library: libraryId,
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
                library: libraryId,

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
                library: libraryId,

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
                library: libraryId,

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
                    library: libraryObjectId,
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

export { addStudent, getStudents, getStudentSummary, getActiveStudents, getExpiredStudents, getExpiringStudents }