import mongoose from "mongoose";
import { libraryModel } from "../models/libraryModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";

const getPayments = async (req, res) => {
  try {
    const userId = req.user.id;

    const { libraryId } = req.params;
    const page = Math.max(parseInt(req.query.page) || 1, 1);

    // 20 records per request
    const limit = 20;
    const skip = (page - 1) * limit;

    // 1. Validate Library ID
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 2. Verify library belongs to logged in user
    const library = await libraryModel
      .findOne({
        _id: libraryId,
        ownerId: userId,
      })
      .select("_id");

    if (!library) {
      return res.status(404).json({
        success: false,
        message: "Library not found or access denied",
      });
    }

    // 3. Fetch payments
    const payments = await paymentModel
      .find({
        libraryId: library._id,
      })
      .populate({
        path: "student",
        select: "name memberId mobile profileImage",
      })
      .sort({
        paymentDate: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(limit + 1)
      .lean();

    // 4. Pagination
    const hasMore = payments.length > limit;

    if (hasMore) {
      payments.pop();
    }

    // 5. Response
    return res.status(200).json({
      success: true,
      message: "Payments fetched successfully",
      page,
      hasMore,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get Payments Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export { getPayments };