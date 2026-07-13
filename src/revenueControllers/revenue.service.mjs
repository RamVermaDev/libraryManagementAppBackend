import { expenseModel } from "../models/expenseModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";
import { getTodayRange, getCurrentMonthRange, getCurrentYearRange, getLast30Days, getLast12Months } from "./revenue.helper.mjs";

const getSummary = async (libraryId) => {

    const today = getTodayRange();

    const month = getCurrentMonthRange();

    const year = getCurrentYearRange();

    const [
        todayIncome,
        monthlyIncome,
        yearlyIncome,
        allTimeIncome,
    ] = await Promise.all([

        paymentModel.aggregate([
            {
                $match: {
                    library: libraryId,
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
                    library: libraryId,
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
                    library: libraryId,
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
                $match: {
                    library: libraryId,
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

    const [
        income,
        expense,
        expenses,
    ] = await Promise.all([

        paymentModel.aggregate([
            {
                $match: {
                    library: libraryId,
                    paymentDate: {
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

        expenseModel.aggregate([
            {
                $match: {
                    libraryId,
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
    ]);

    const monthlyIncome =
        income.length
            ? income[0].total
            : 0;

    const monthlyExpense =
        expense.length
            ? expense[0].total
            : 0;

    return {

        income: monthlyIncome,

        expense: monthlyExpense,

        profit:
            monthlyIncome - monthlyExpense,

        expenses,
    };
};

const getRecentPayments = async (libraryId) => {

    const payments = await paymentModel
        .find({
            library: libraryId,
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

    const trend = await paymentModel.aggregate([

        {
            $match: {
                library: libraryId,
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

    const startDate = new Date(
        now.getFullYear(),
        now.getMonth() - 11,
        1,
    );

    const trend = await paymentModel.aggregate([

        {
            $match: {
                library: libraryId,
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
