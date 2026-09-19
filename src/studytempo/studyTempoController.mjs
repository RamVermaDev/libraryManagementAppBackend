import mongoose from 'mongoose';
import { libraryModel } from '../models/libraryModel.mjs';
import { studentModel } from '../models/studentModel.mjs';
import { bookIssueModel } from '../models/bookIssueModel.mjs';
import { noticeModel } from '../models/noticeModel.mjs';

/**
 * Search active libraries by Name or WhatsApp / Contact Phone Number.
 * Endpoint: GET /api/studytempo/search-libraries?q=...
 */
export const searchLibraries = async (req, res) => {
    try {
        const query = (req.query.q || '').trim();

        if (!query || query.length < 2) {
            return res.status(200).json({
                success: true,
                message: 'Query too short',
                data: [],
            });
        }

        const isNumeric = /^\d+$/.test(query);
        const searchConditions = [
            { libraryName: { $regex: query, $options: 'i' } },
        ];

        if (isNumeric) {
            searchConditions.push({ whatsappNumber: { $regex: query, $options: 'i' } });
        } else {
            searchConditions.push({ city: { $regex: query, $options: 'i' } });
        }

        const libraries = await libraryModel
            .find({
                status: 'active',
                isDeleted: false,
                $or: searchConditions,
            })
            .select('_id libraryName whatsappNumber city state address tagLine')
            .limit(15)
            .lean();

        return res.status(200).json({
            success: true,
            message: 'Libraries retrieved successfully',
            data: libraries,
        });
    } catch (error) {
        console.error('StudyTempo searchLibraries error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to search libraries',
        });
    }
};

/**
 * Verify Student Pass
 * Endpoint: POST /api/studytempo/verify-pass
 * Body: { libraryId, studentId, phone }
 */
export const verifyStudentPass = async (req, res) => {
    try {
        const { libraryId, studentId, phone, fcmToken } = req.body;

        if (!libraryId || !studentId || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Library, Student ID, and Phone Number are required',
            });
        }

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Library ID',
            });
        }

        const cleanPhone = String(phone).trim().replace(/\D/g, '');
        const rawId = String(studentId).trim();

        if (cleanPhone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 10-digit mobile number',
            });
        }

        // Build flexible Student ID search variants (e.g. '001', '01', '1')
        const variants = new Set();
        variants.add(rawId);
        const parsedInt = parseInt(rawId, 10);
        if (!isNaN(parsedInt)) {
            variants.add(String(parsedInt));
            variants.add(String(parsedInt).padStart(2, '0'));
            variants.add(String(parsedInt).padStart(3, '0'));
            variants.add(String(parsedInt).padStart(4, '0'));
        }

        // Find student in that specific library
        const student = await studentModel
            .findOne({
                libraryId,
                phone: cleanPhone,
                studentId: { $in: Array.from(variants) },
            })
            .populate('libraryId', 'libraryName whatsappNumber city state address tagLine')
            .populate('seatId', 'seatNumber')
            .populate('slotTemplateId', 'name startMinute endMinute');

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'No student found with this ID and registered mobile in this library',
            });
        }

        // If client provided an FCM token, save or refresh it
        if (fcmToken && typeof fcmToken === 'string' && fcmToken.trim().length > 10) {
            await studentModel.findByIdAndUpdate(student._id, {
                fcmToken: fcmToken.trim(),
                fcmTokenUpdatedAt: new Date(),
            });
            console.log(`[StudyTempo] Registered FCM token for student ${student.name} (${student.studentId})`);
        }

        // Check if student is blacklisted/blocked
        if (student.status === 'blacklisted') {
            return res.status(403).json({
                success: false,
                message: 'Your account has been blocked by the library desk. Contact the administrator.',
            });
        }

        // Check if student is paused
        if (student.status === 'paused') {
            return res.status(403).json({
                success: false,
                message: 'Your library membership is currently paused. Please resume it at the desk.',
            });
        }

        // Check if membership is expired
        if (student.currentExpireDate) {
            const expireDate = new Date(student.currentExpireDate);
            const now = new Date();
            if (expireDate < now) {
                return res.status(403).json({
                    success: false,
                    message: 'Your library membership has expired. Please renew your membership at the desk.',
                });
            }
        }

        // Calculate days remaining
        let daysLeft = null;
        if (student.currentExpireDate) {
            const diffMs = new Date(student.currentExpireDate) - new Date();
            daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }

        // Query active issued books for this student
        let issuedBooks = [];
        try {
            const activeIssues = await bookIssueModel
                .find({
                    libraryId,
                    studentId: student._id,
                    status: 'issued',
                })
                .populate('bookId', 'name category')
                .lean();

            issuedBooks = activeIssues.map((issue) => ({
                id: issue._id.toString(),
                bookName: issue.bookId?.name || 'Book',
                category: issue.bookId?.category || 'General',
                issueDate: issue.issueDate,
                dueDate: issue.dueDate,
                rentPrice: issue.rentPrice || 0,
            }));
        } catch (bookErr) {
            console.error('Error fetching issued books for student pass:', bookErr);
        }

        // Structure response
        const pass = {
            studentMongoId: student._id.toString(),
            studentId: student.studentId,
            studentName: student.name,
            phone: student.phone,
            status: student.status,
            libraryId: student.libraryId?._id?.toString() || libraryId,
            libraryName: student.libraryId?.libraryName || 'Study Library',
            libraryPhone: student.libraryId?.whatsappNumber || '',
            libraryCity: student.libraryId?.city || '',
            libraryState: student.libraryId?.state || '',
            libraryAddress: student.libraryId?.address || '',
            seatNumber: student.seatId?.seatNumber || 'Unassigned / Floating',
            slotName: student.slotTemplateId?.name || 'General Slot',
            slotTiming: student.slotTiming || '',
            currentStartDate: student.currentStartDate,
            currentExpireDate: student.currentExpireDate,
            currentPlanDays: student.currentPlanDays || 0,
            daysLeft: daysLeft,
            totalPending: student.totalPending || 0,
            photoPublicId: student.photoPublicId || '',
            issuedBooks: issuedBooks,
            connectedAt: new Date().toISOString(),
        };

        return res.status(200).json({
            success: true,
            message: 'Pass verified successfully',
            data: { pass },
        });
    } catch (error) {
        console.error('StudyTempo verifyStudentPass error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify student pass',
        });
    }
};

/**
 * Fetch active broadcast notices for a library
 * Endpoint: GET /api/studytempo/notices/:libraryId
 */
export const getActiveLibraryNotices = async (req, res) => {
    try {
        const { libraryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(libraryId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Library ID',
            });
        }

        const notices = await noticeModel
            .find({
                libraryId,
                recipientRole: { $in: ["student", "all"] },
                category: "ANNOUNCEMENT",
                expiresAt: { $gt: new Date() },
            })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        return res.status(200).json({
            success: true,
            message: 'Active notices retrieved successfully',
            data: notices,
        });
    } catch (error) {
        console.error('StudyTempo getActiveLibraryNotices error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve notices',
        });
    }
};
