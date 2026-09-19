import express from 'express';
import { getActiveLibraryNotices, searchLibraries, verifyStudentPass } from './studyTempoController.mjs';

const router = express.Router();

// Search active libraries by name or phone
router.get('/search-libraries', searchLibraries);

// Verify student pass with ID, Phone, and Library
router.post('/verify-pass', verifyStudentPass);

// Fetch active notices for a library
router.get('/notices/:libraryId', getActiveLibraryNotices);

export const studyTempoRoutes = router;
export default router;
