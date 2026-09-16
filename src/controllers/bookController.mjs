import mongoose from "mongoose";
import { bookModel } from "../models/bookModel.mjs";
import { bookIssueModel } from "../models/bookIssueModel.mjs";
import { studentModel } from "../models/studentModel.mjs";
import { libraryModel } from "../models/libraryModel.mjs";
import { paymentModel } from "../models/payementModel.mjs";

/**
 * Add a new book to library inventory
 */
export const addBook = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const { name, category, copies, rentPrice } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: "Invalid library ID" });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Book name is required" });
        }

        const totalCopies = Math.max(1, parseInt(copies, 10) || 1);
        const numericRentPrice = Math.max(0, parseFloat(rentPrice) || 0);

        const book = await bookModel.create({
            libraryId,
            name: name.trim(),
            category: (category && category.trim()) ? category.trim() : "General",
            copies: totalCopies,
            availableCopies: totalCopies,
            rentPrice: numericRentPrice,
        });

        return res.status(201).json({
            success: true,
            message: "Book added successfully",
            data: { book },
        });
    } catch (error) {
        console.error("ADD BOOK ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to add book",
        });
    }
};

/**
 * Get all books for a library (with search & category filter)
 */
export const getBooks = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const { search, category } = req.query;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: "Invalid library ID" });
        }

        const filter = { libraryId };

        if (category && category.trim()) {
            filter.category = category.trim();
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            filter.$or = [{ name: regex }, { category: regex }];
        }

        const books = await bookModel
            .find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Books fetched successfully",
            data: { books },
        });
    } catch (error) {
        console.error("GET BOOKS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch books",
        });
    }
};

/**
 * Update an existing book
 */
export const updateBook = async (req, res) => {
    try {
        const { libraryId, bookId } = req.params;
        const { name, category, copies, rentPrice } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ success: false, message: "Invalid library or book ID" });
        }

        const book = await bookModel.findOne({ _id: bookId, libraryId });
        if (!book) {
            return res.status(404).json({ success: false, message: "Book not found" });
        }

        if (name && name.trim()) {
            book.name = name.trim();
        }

        if (category !== undefined) {
            book.category = category.trim() || "General";
        }

        if (rentPrice !== undefined) {
            book.rentPrice = Math.max(0, parseFloat(rentPrice) || 0);
        }

        if (copies !== undefined) {
            const newTotal = Math.max(1, parseInt(copies, 10) || 1);
            const currentlyIssued = book.copies - book.availableCopies;

            if (newTotal < currentlyIssued) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot set total copies to ${newTotal}. ${currentlyIssued} copies are currently issued to students.`,
                });
            }

            book.copies = newTotal;
            book.availableCopies = newTotal - currentlyIssued;
        }

        await book.save();

        return res.status(200).json({
            success: true,
            message: "Book updated successfully",
            data: { book },
        });
    } catch (error) {
        console.error("UPDATE BOOK ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to update book",
        });
    }
};

/**
 * Delete a book
 */
export const deleteBook = async (req, res) => {
    try {
        const { libraryId, bookId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ success: false, message: "Invalid library or book ID" });
        }

        const book = await bookModel.findOne({ _id: bookId, libraryId });
        if (!book) {
            return res.status(404).json({ success: false, message: "Book not found" });
        }

        // Check if any copies are currently issued
        const activeIssuesCount = await bookIssueModel.countDocuments({
            libraryId,
            bookId,
            status: "issued",
        });

        if (activeIssuesCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete book. ${activeIssuesCount} copy is currently issued to students.`,
            });
        }

        await bookModel.deleteOne({ _id: bookId, libraryId });

        return res.status(200).json({
            success: true,
            message: "Book deleted successfully",
        });
    } catch (error) {
        console.error("DELETE BOOK ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to delete book",
        });
    }
};

/**
 * Issue a book to a student
 */
export const issueBook = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const { bookId, studentId, dueDate, rentPrice, paymentMode } = req.body;

        if (!mongoose.Types.ObjectId.isValid(libraryId) ||
            !mongoose.Types.ObjectId.isValid(bookId) ||
            !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: "Invalid IDs provided" });
        }

        const book = await bookModel.findOne({ _id: bookId, libraryId });
        if (!book) {
            return res.status(404).json({ success: false, message: "Book not found" });
        }

        if (book.availableCopies <= 0) {
            return res.status(400).json({
                success: false,
                message: "No copies available to issue for this book",
            });
        }

        const student = await studentModel.findOne({ _id: studentId, libraryId }).select("_id name phone");
        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found in this library" });
        }

        // Decrement available copies
        book.availableCopies = Math.max(0, book.availableCopies - 1);
        await book.save();

        let parsedDueDate = null;
        if (dueDate) {
            parsedDueDate = new Date(dueDate);
            if (Number.isNaN(parsedDueDate.getTime())) {
                parsedDueDate = null;
            }
        }

        const numericRentPrice = rentPrice !== undefined ? Math.max(0, parseFloat(rentPrice) || 0) : (book.rentPrice || 0);

        const issue = await bookIssueModel.create({
            libraryId,
            bookId,
            studentId,
            issueDate: new Date(),
            dueDate: parsedDueDate,
            rentPrice: numericRentPrice,
            status: "issued",
        });

        let createdPayment = null;
        if (numericRentPrice > 0) {
            const validMode = (paymentMode && (paymentMode === "Online" || paymentMode === "Cash")) ? paymentMode : "Cash";
            createdPayment = await paymentModel.create({
                libraryId,
                student: studentId,
                amount: numericRentPrice,
                paymentMode: validMode,
                tracker: "credit",
                paymentDate: new Date(),
                note: `Book Issue Rent: ${book.name}`,
            });
        }

        const populatedIssue = await bookIssueModel
            .findById(issue._id)
            .populate("bookId", "name category copies availableCopies rentPrice")
            .populate("studentId", "name phone studentId seatId")
            .lean();

        return res.status(201).json({
            success: true,
            message: "Book issued successfully",
            data: {
                issue: populatedIssue,
                book,
                payment: createdPayment,
            },
        });
    } catch (error) {
        console.error("ISSUE BOOK ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to issue book",
        });
    }
};

/**
 * Return an issued book
 */
export const returnBook = async (req, res) => {
    try {
        const { libraryId, issueId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(issueId)) {
            return res.status(400).json({ success: false, message: "Invalid library or issue ID" });
        }

        const issue = await bookIssueModel.findOne({
            _id: issueId,
            libraryId,
            status: "issued",
        });

        if (!issue) {
            return res.status(404).json({ success: false, message: "Active book issue not found" });
        }

        issue.status = "returned";
        issue.returnDate = new Date();
        await issue.save();

        // Increment book available copies
        const book = await bookModel.findOne({ _id: issue.bookId, libraryId });
        if (book) {
            book.availableCopies = Math.min(book.copies, book.availableCopies + 1);
            await book.save();
        }

        const populatedIssue = await bookIssueModel
            .findById(issue._id)
            .populate("bookId", "name category copies availableCopies rentPrice")
            .populate("studentId", "name phone studentId seatId")
            .lean();

        return res.status(200).json({
            success: true,
            message: "Book returned successfully",
            data: { issue: populatedIssue, book },
        });
    } catch (error) {
        console.error("RETURN BOOK ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to return book",
        });
    }
};

/**
 * Get all book issue records for a library
 */
export const getBookIssues = async (req, res) => {
    try {
        const { libraryId } = req.params;
        const { status, bookId, studentId, page, limit } = req.query;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({ success: false, message: "Invalid library ID" });
        }

        const filter = { libraryId };

        if (status && (status === "issued" || status === "returned")) {
            filter.status = status;
        }

        if (bookId && mongoose.Types.ObjectId.isValid(bookId)) {
            filter.bookId = bookId;
        }

        if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
            filter.studentId = studentId;
        }

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;

        const totalCount = await bookIssueModel.countDocuments(filter);

        const issues = await bookIssueModel
            .find(filter)
            .populate("bookId", "name category copies availableCopies rentPrice")
            .populate("studentId", "name phone studentId seatId")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        return res.status(200).json({
            success: true,
            message: "Book issues fetched successfully",
            data: {
                issues,
                total: totalCount,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(totalCount / limitNum),
                hasMore: pageNum * limitNum < totalCount,
            },
        });
    } catch (error) {
        console.error("GET BOOK ISSUES ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch book issues",
        });
    }
};

/**
 * Get all book issues for a single student
 */
export const getStudentBookIssues = async (req, res) => {
    try {
        const { libraryId, studentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId) || !mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: "Invalid library or student ID" });
        }

        const issues = await bookIssueModel
            .find({ libraryId, studentId })
            .populate("bookId", "name category copies availableCopies rentPrice")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Student book issues fetched successfully",
            data: { issues },
        });
    } catch (error) {
        console.error("GET STUDENT BOOK ISSUES ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch student book issues",
        });
    }
};
