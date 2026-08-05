import mongoose from "mongoose";
import { libraryModel } from "../models/libraryModel.mjs";
import { userModel } from "../models/userModel.mjs";
import { seatModel } from "../models/seatModel.mjs";

export const createLibrary = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const ownerId = req.user._id;

        const {
            libraryName,
            tagLine,
            whatsappNumber,
            city = '',
            state = '',
            pinCode = '',
            totalSeats = 0
        } = req.body;

        const seatsCount = Number(totalSeats) > 0 ? Number(totalSeats) : 0;

        // Validate required fields
        if (
            !libraryName ||
            !whatsappNumber ||
            !city 
        ) {
            await session.abortTransaction();
            session.endSession();

            return res.status(400).json({
                success: false,
                message: "Please fill all required fields."
            });
        }

        // Check if owner exists
        const owner = await userModel.findById(ownerId).session(session);

        if (!owner) {
            await session.abortTransaction();
            session.endSession();

            return res.status(404).json({
                success: false,
                message: "Owner not found."
            });
        }

        // Create Library with default 6 columns
        const defaultColumns = 6;
        const defaultRows = seatsCount > 0 ? Math.ceil(seatsCount / defaultColumns) : 1;

        const library = new libraryModel({
            ownerId,
            libraryName,
            tagLine,
            whatsappNumber,
            city,
            state,
            pinCode,
            totalSeats: seatsCount,
            seatLayout: {
                rows: defaultRows,
                columns: defaultColumns,
            },
        });

        await library.save({ session });

        // Auto-generate seat documents inside transaction if totalSeats > 0
        if (seatsCount > 0) {
            const seatDocs = [];
            const prefix = req.body.prefix || req.body.seatPrefix || 'A';
            for (let seatNumber = 1; seatNumber <= seatsCount; seatNumber++) {
                seatDocs.push({
                    libraryId: library._id,
                    seatNumber,
                    label: `${prefix}-${seatNumber}`,
                    status: "active",
                });
            }
            await seatModel.insertMany(seatDocs, { session });
        }

        // Save library id into user's libraries array
        owner.libraries.push(library._id);

        await owner.save({ session });

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            success: true,
            message: "Library created successfully.",
            library,
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("Create Library Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error."
        });
    }
};

export const getOwnerLibraries = async (req, res) => {
    try {
        const libraries = await libraryModel
            .find({
                ownerId: req.user._id,
                isDeleted: false
            })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Libraries fetched successfully.",
            libraries,
        });

    } catch (error) {
        console.error("Get Owner Libraries Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error."
        });
    }
};

export const updateLibrary = async (req, res) => {
    try {
        const { libraryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid library id."
            });
        }

        const {
            libraryName,
            tagLine = "",
            whatsappNumber,
            city = "",
            state = "",
            pinCode = "",
            totalSeats = 0
        } = req.body;

        if (!libraryName || !whatsappNumber || !city) {
            return res.status(400).json({
                success: false,
                message: "Please fill all required fields."
            });
        }

        const library = await libraryModel.findOne({
            _id: libraryId,
            ownerId: req.user._id,
            isDeleted: false
        });

        if (!library) {
            return res.status(404).json({
                success: false,
                message: "Library not found."
            });
        }

        const nextTotalSeats = Number(totalSeats) || 0;

        library.libraryName = libraryName;
        library.tagLine = tagLine;
        library.whatsappNumber = whatsappNumber;
        library.city = city;
        library.state = state;
        library.pinCode = pinCode;
        library.totalSeats = nextTotalSeats;

        await library.save();

        return res.status(200).json({
            success: true,
            message: "Library updated successfully.",
            library,
        });

    } catch (error) {
        console.error("Update Library Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error."
        });
    }
};
