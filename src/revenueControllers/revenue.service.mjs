import mongoose from "mongoose";
import { expenseModel } from "../models/expenseModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { getTodayRange, getCurrentMonthRange, getCurrentYearRange, getLast30Days, getLast12Months } from "./revenue.helper.mjs";

const getSummary = async (libraryId) => {

    const today = getTodayRange();
    const month = getCurrentMonthRange();
    const year = getCurrentYearRange();
    const objectId = new mongoose.Types.ObjectId(libraryId);

    const creditFilter = {
        $or: [{ libraryId: objectId }, { library: objectId }],
        tracker: { $ne: "refund" }
    };

    const [
        todayIncome,
        monthlyIncome,
        yearlyIncome,
        allTimeIncome,
    ] = await Promise.all([

        paymentModel.aggregate([
            {
                $match: {
                    ...creditFilter,
                    paymentDate: {
                        $gte: today.start,
                        $lte: today.end,
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]),

        paymentModel.aggregate([
            {
                $match: {
                    ...creditFilter,
                    paymentDate: {
                        $gte: month.start,
                        $lte: month.end,
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]),

        paymentModel.aggregate([
            {
                $match: {
                    ...creditFilter,
                    paymentDate: {
                        $gte: year.start,
                        $lte: year.end,
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]),

        paymentModel.aggregate([
            {
                $match: creditFilter,
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]),
    ]);

    return {

        todayIncome:
            todayIncome.length > 0
                ? todayIncome[0].total
                : 0,

        monthlyIncome:
            monthlyIncome.length > 0
                ? monthlyIncome[0].total
                : 0,

        yearlyIncome:
            yearlyIncome.length > 0
                ? yearlyIncome[0].total
                : 0,

        allTimeIncome:
            allTimeIncome.length > 0
                ? allTimeIncome[0].total
                : 0,
    };
};


const getCurrentMonthSummary = async (
    libraryId,
    month,
    year,
) => {

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(
        year,
        month,
        0,
        23,
        59,
        59,
        999,
    );

    const objectId = new mongoose.Types.ObjectId(libraryId);

    const creditFilter = {
        $or: [{ libraryId: objectId }, { library: objectId }],
        tracker: { $ne: "refund" },
        paymentDate: {
            $gte: startDate,
            $lte: endDate,
        },
    };

    const refundFilter = {
        $or: [{ libraryId: objectId }, { library: objectId }],
        tracker: "refund",
        paymentDate: {
            $gte: startDate,
            $lte: endDate,
        },
    };

    const [
        income,
        refundExpense,
        expense,
        expenses,
        refunds,
    ] = await Promise.all([

        // 1. Gross Income (Credits / Non-refunds)
        paymentModel.aggregate([
            {
                $match: creditFilter,
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]),

        // 2. Refunds sum in the selected month
        paymentModel.aggregate([
            {
                $match: refundFilter,
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]),

        // 3. Manual Expenses in the selected month
        expenseModel.aggregate([
            {
                $match: {
                    libraryId: objectId,
                    expenseDate: {
                        $gte: startDate,
                        $lte: endDate,
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]),

        // 4. List of manual expenses
        expenseModel
            .find({
                libraryId,
                expenseDate: {
                    $gte: startDate,
                    $lte: endDate,
                },
            })
            .sort({
                expenseDate: -1,
                createdAt: -1,
            }),

        // 5. List of refunds in the selected month
        paymentModel
            .find(refundFilter)
            .populate({
                path: "student",
                select: "name memberId profileImage",
            })
            .sort({
                paymentDate: -1,
                createdAt: -1,
            })
            .lean(),
    ]);

    const monthlyIncome =
        income.length
            ? income[0].total
            : 0;

    const monthlyRefunds =
        refundExpense.length
            ? refundExpense[0].total
            : 0;

    const monthlyManualExpense =
        expense.length
            ? expense[0].total
            : 0;

    // Total monthly expense combines manual expenses + student refunds
    const totalMonthlyExpense = monthlyManualExpense + monthlyRefunds;

    return {

        income: monthlyIncome,

        expense: totalMonthlyExpense,

        profit:
            monthlyIncome - totalMonthlyExpense,

        expenses,

        refunds,
    };
};

const getRecentPayments = async (libraryId) => {
    const objectId = new mongoose.Types.ObjectId(libraryId);

    const payments = await paymentModel
        .find({
            $or: [{ libraryId: objectId }, { library: objectId }],
        })
        .populate({
            path: "student",
            select: "name memberId profileImage",
        })
        .sort({
            paymentDate: -1,
            createdAt: -1,
        })
        .limit(7)
        .lean();

    return payments;
};

const getRecentExpenses = async (
    libraryId,
    month,
    year,
) => {

    const startDate = new Date(year, month - 1, 1);

    const endDate = new Date(
        year,
        month,
        0,
        23,
        59,
        59,
        999,
    );

    const expenses = await expenseModel
        .find({
            libraryId,
            expenseDate: {
                $gte: startDate,
                $lte: endDate,
            },
        })
        .sort({
            expenseDate: -1,
            createdAt: -1,
        })
        .lean();

    return expenses;
};

const getThirtyDayTrend = async (libraryId) => {

    const { start, end } = getLast30Days();
    const objectId = new mongoose.Types.ObjectId(libraryId);

    const trend = await paymentModel.aggregate([

        {
            $match: {
                $or: [{ libraryId: objectId }, { library: objectId }],
                tracker: { $ne: "refund" },
                paymentDate: {
                    $gte: start,
                    $lte: end,
                },
            },
        },

        {
            $group: {
                _id: {
                    year: {
                        $year: "$paymentDate",
                    },
                    month: {
                        $month: "$paymentDate",
                    },
                    day: {
                        $dayOfMonth: "$paymentDate",
                    },
                },

                income: {
                    $sum: "$amount",
                },
            },
        },

        {
            $sort: {
                "_id.year": 1,
                "_id.month": 1,
                "_id.day": 1,
            },
        },

        {
            $project: {

                _id: 0,

                year: "$_id.year",

                month: "$_id.month",

                day: "$_id.day",

                income: 1,
            },
        },

    ]);

    return trend;
};

const getTwelveMonthTrend = async (libraryId) => {

    const now = new Date();
    const objectId = new mongoose.Types.ObjectId(libraryId);

    const startDate = new Date(
        now.getFullYear(),
        now.getMonth() - 11,
        1,
    );

    const trend = await paymentModel.aggregate([

        {
            $match: {
                $or: [{ libraryId: objectId }, { library: objectId }],
                tracker: { $ne: "refund" },
                paymentDate: {
                    $gte: startDate,
                    $lte: now,
                },
            },
        },

        {
            $group: {

                _id: {

                    year: {
                        $year: "$paymentDate",
                    },

                    month: {
                        $month: "$paymentDate",
                    },

                },

                income: {
                    $sum: "$amount",
                },

            },
        },

        {
            $sort: {
                "_id.year": 1,
                "_id.month": 1,
            },
        },

        {
            $project: {

                _id: 0,

                year: "$_id.year",

                month: "$_id.month",

                income: 1,

            },
        },

    ]);

    return trend;
};


export { getSummary, getCurrentMonthSummary, getRecentPayments, getRecentExpenses, getThirtyDayTrend, getTwelveMonthTrend };

