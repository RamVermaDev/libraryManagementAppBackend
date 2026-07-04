import mongoose from "mongoose";
import { studentModel } from "../models/studentModel.mjs";
import { feeRecordModel } from "../models/feeRecordModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";

const addStudent = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const {
            name,
            phone,
            gender,
            idProof,

            planId,
            programDays,
            startDate,
            expireDate,

            amount,
            discount = 0,
            paidAmount = 0,
            paymentMode,
            libraryId
        } = req.body;

        // Get library from authenticated user
        //if I can use then i will
        //const libraryId = req.user.libraryId;

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
                    gender,
                    idProof: idProof?.trim() || null,

                    joiningDate: parsedStartDate,

                    currentPlan: planId,
                    currentProgramDays: numericProgramDays,
                    currentStartDate: parsedStartDate,
                    currentExpireDate: parsedExpireDate,

                    totalPaid: numericPaidAmount,
                    totalPending: pendingAmount,

                    lastPaymentDate:
                        numericPaidAmount > 0 ? new Date() : null,
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

export { addStudent }