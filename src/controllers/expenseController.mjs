import mongoose from "mongoose";
import { libraryModel } from "../models/libraryModel.mjs";
import { expenseModel } from "../models/expenseModel.mjs";

const addExpense = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      libraryId,
      title,
      amount,
      category,
      expenseDate,
      description,
    } = req.body;

    // 1. Validate required fields
    if (!libraryId || !title || amount === undefined || !category || !expenseDate) {
      return res.status(400).json({
        success: false,
        message:
          "Library ID, title, amount, category and expense date are required",
      });
    }

    // 2. Validate library ID
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 3. Clean input
    const cleanTitle = title.trim();
    const cleanCategory = category.trim();
    const cleanDescription = description?.trim() || "";

    if (cleanTitle.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Expense title must be at least 3 characters",
      });
    }

    // 4. Validate amount
    const parsedAmount = Number(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid amount",
      });
    }

    // 5. Validate expense date
    const parsedExpenseDate = new Date(expenseDate);

    if (Number.isNaN(parsedExpenseDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense date",
      });
    }

    // 6. Verify library belongs to logged-in user
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

    // 7. Create expense
    const expense = await expenseModel.create({
      libraryId: library._id,
      title: cleanTitle,
      amount: parsedAmount,
      category: cleanCategory,
      expenseDate: parsedExpenseDate,
      description: cleanDescription,
    });

    return res.status(201).json({
      success: true,
      message: "Expense added successfully",
      expense,
    });
  } catch (error) {
    console.error("Add Expense Error:", error);

    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)
        .map((item) => item.message)
        .join(", ");

      return res.status(400).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


const deleteExpense = async (req, res) => {
  try {
    // Authentication required
    const userId = req.user.id;

    const { expenseId } = req.params;

    // // 1. Validate required fields
    // if (!libraryId) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Library ID is required",
    //   });
    // }

    // // 2. Validate expense ID
    // if (!mongoose.Types.ObjectId.isValid(expenseId)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid expense ID",
    //   });
    // }

    // // 3. Validate library ID
    // if (!mongoose.Types.ObjectId.isValid(libraryId)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid library ID",
    //   });
    // }

    // // 4. Verify library exists and belongs to logged-in user
    // const library = await libraryModel
    //   .findOne({
    //     _id: libraryId,
    //     ownerId: userId,
    //   })
    //   .select("_id");

    // if (!library) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Library not found or access denied",
    //   });
    // }

    // 5. Delete only if expense belongs to this library
    const deletedExpense = await expenseModel.findOneAndDelete({
      _id: expenseId,
      //libraryId: library._id,
    });

    if (!deletedExpense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
      expense: deletedExpense,
    });
  } catch (error) {
    console.error("Delete Expense Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAllExpenses = async (req, res) => {
  try {
    // Authentication required
    const userId = req.user.id;

    const { libraryId } = req.params;

    // 1. Validate library ID
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 2. Verify library exists and belongs to user
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

    // 3. Get all expenses belonging to this library
    const expenses = await expenseModel
      .find({
        libraryId: library._id,
      })
      .sort({
        expenseDate: -1,
        createdAt: -1,
      });

    // 4. Return expenses
    return res.status(200).json({
      success: true,
      message: "Expenses fetched successfully",
      count: expenses.length,
      expenses,
    });
  } catch (error) {
    console.error("Get All Expenses Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export { addExpense, deleteExpense };