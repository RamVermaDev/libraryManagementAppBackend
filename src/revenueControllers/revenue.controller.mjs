import mongoose from "mongoose";

import { libraryModel } from "../models/libraryModel.mjs";

import {
    getSummary,
    getCurrentMonthSummary,
    getRecentPayments,
    getRecentExpenses,
    getThirtyDayTrend,
    getTwelveMonthTrend,
} from "./revenue.service.mjs";

const dashboard = async (req, res) => {

    try {

        //const userId = req.user.id;
        const { libraryId } = req.params;

        let { month, year } = req.query;

        const now = new Date();

        month = Number(month) || now.getMonth() + 1;

        year = Number(year) || now.getFullYear();

        const library = await libraryModel
            .findOne({
                _id: libraryId,
                //ownerId: userId,
            })
            .select("_id");

        if (!library) {
            return res.status(404).json({
                success: false,
                message: "Library not found",
            });
        }

        const [
            summary,
            monthSummary,
            recentPayments,
            recentExpenses,
            trend30Days,
            trend12Months,
        ] = await Promise.all([

            getSummary(library._id),

            getCurrentMonthSummary(
                library._id,
                month,
                year,
            ),

            getRecentPayments(library._id),

            getRecentExpenses(
                library._id,
                month,
                year,
            ),

            getThirtyDayTrend(library._id),

            getTwelveMonthTrend(library._id),

        ]);

        return res.status(200).json({

            success: true,

            revenue: {

                summary,

                monthSummary,

                recentPayments,

                recentExpenses,

                trend30Days,

                trend12Months,

            },

        });

    }

    catch (error) {

        console.error("Revenue Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });

    }

};

const getMonthlyRevenue = async (req, res) => {

    try {
        console.log('hi')

        // const userId = req.user.id;
        const { libraryId } = req.params;


        let { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: "Month and year are required.",
            });
        }

        month = Number(month);
        year = Number(year);

        if (month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                message: "Invalid month.",
            });
        }

        const library = await libraryModel
            .findOne({
                //ownerId: userId,
                _id:libraryId,
                isDeleted: false,
            })
            .select("_id");

        if (!library) {
            return res.status(404).json({
                success: false,
                message: "Library not found.",
            });
        }

        const monthData = await getCurrentMonthSummary(
            library._id,
            month,
            year,
        );

        return res.status(200).json({
            success: true,
            monthData,
        });

    } catch (error) {

        console.error("GET MONTHLY REVENUE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });

    }

};

export { dashboard, getMonthlyRevenue };