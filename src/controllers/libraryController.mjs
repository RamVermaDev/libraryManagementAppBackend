import mongoose from "mongoose";
import { libraryModel } from "../models/libraryModel.mjs";
import { userModel } from "../models/userModel.mjs";

export const createLibrary = async (req, res) => {
    console.log('happen')

    const session = await mongoose.startSession();

    try {
        console.log('happen')

        session.startTransaction();

        const ownerId = req.user._id;

        const {
            libraryName,
            tagLine,
            whatsappNumber,
            city,
            state,
            pinCode,
            totalSeats = 0
        } = req.body;

        // Validate required fields
        if (
            !libraryName ||
            !whatsappNumber ||
            !city ||
            !state ||
            !pinCode
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

        // Create Library
        const library = new libraryModel({
            ownerId,
            libraryName,
            tagLine,
            whatsappNumber,
            city,
            state,
            pinCode,
            totalSeats,
            availableSeats: totalSeats,
        });

        await library.save({ session });

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