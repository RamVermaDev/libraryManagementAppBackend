import express from 'express'
import { appModeMiddleware } from './middleware/appModeMiddleware.mjs'
import { checkSubscription } from './middleware/checkSubscription.mjs'
import { getCurrentUser, loginUser, sendAdminModeOtp, sendEmailVerificationOtp, signupUser, updateProfile, verifyAdminModeOtp, verifyEmailOtp, getSubscriptionStatus } from './controllers/userController.mjs'
import { createSubscriptionOrder, verifySubscriptionPayment } from './controllers/subscriptionController.mjs'
import { createLibrary, getOwnerLibraries, updateLibrary } from './controllers/libraryController.mjs'
import { authenticate } from './auth/authorization.mjs'
import { addStudent, clearStudentPending, getActiveStudents, getExpiredStudents, getExpiringStudents, getPendingStudents, getStudents, getStudentSummary, updateStudentProfile, refundStudent, renewStudent, pauseStudent, resumeStudent, blacklistStudent, unblockStudent, deleteStudent, globalSearchStudents, getStudentFeeRecords } from './controllers/studentController.mjs'
import { addTask, completeTask, deleteTask, editTask, getAllTasks } from './controllers/taskController.mjs'
import { addExpense, deleteExpense } from './controllers/expenseController.mjs'
import { dashboard, getMonthlyRevenue } from './revenueControllers/revenue.controller.mjs'
import { getPayments } from './controllers/payementController.mjs'
import { addSeats, createSeats, getSeatConfig, listSeats, updateSeatConfig, updateSeatStatus } from './claude/seatController.mjs'
import { createSlot, deleteSlot, editSlot, listSlots, updateSlotStatus } from './claude/slotController.mjs'
import { getAvailability } from './claude/availabilityController.mjs'
import { cancelReservation, editReservation, renewReservation, createReservation } from './claude/bookingController.mjs'
import { getSeatMapForSlot } from './claude/seatMapController.mjs'
import { upload, excelUpload } from './middleware/upload.mjs'
import { deleteImage, uploadImage } from './controllers/uploadController.mjs'
import { bulkImportStudents, clearLibraryData, downloadSampleTemplate } from './controllers/bulkImportController.mjs'


const routes = express.Router()

routes.use(appModeMiddleware)


routes.get('/', (req, res) => {
    return res.send('Hello Routes')
})

//User Related API
routes.post('/api/register', signupUser)
routes.post('/api/login', loginUser)
routes.put('/api/profile', authenticate, updateProfile)
routes.post('/api/verify-email', authenticate, sendEmailVerificationOtp)
routes.post('/api/otp-verify', authenticate, verifyEmailOtp)
routes.post('/api/send-admin-otp', authenticate, sendAdminModeOtp)
routes.post('/api/verify-admin-otp', authenticate, verifyAdminModeOtp)
routes.get('/api/verify-token', authenticate, getCurrentUser)
routes.get('/api/subscription/status', authenticate, getSubscriptionStatus)
routes.post('/api/subscription/create-order', authenticate, createSubscriptionOrder)
routes.post('/api/subscription/verify-payment', authenticate, verifySubscriptionPayment)

//Library related API
routes.post('/api/createlibrary', authenticate, createLibrary)
routes.get('/api/my-libraries', authenticate, getOwnerLibraries)
routes.patch('/api/:libraryId/updatelibrary', authenticate, updateLibrary)

//Student related API
routes.post('/api/addstudent', authenticate, checkSubscription, addStudent)
routes.patch('/api/:libraryId/students/:studentId/profile', authenticate, checkSubscription, updateStudentProfile)
routes.patch('/api/:libraryId/students/:studentId/clear-pending', authenticate, checkSubscription, clearStudentPending)
routes.patch('/api/:libraryId/students/:studentId/refund', authenticate, checkSubscription, refundStudent)
routes.patch('/api/:libraryId/students/:studentId/renew', authenticate, checkSubscription, renewStudent)
routes.patch('/api/:libraryId/students/:studentId/pause', authenticate, checkSubscription, pauseStudent)
routes.patch('/api/:libraryId/students/:studentId/resume', authenticate, checkSubscription, resumeStudent)
routes.patch('/api/:libraryId/students/:studentId/blacklist', authenticate, checkSubscription, blacklistStudent)
routes.patch('/api/:libraryId/students/:studentId/unblock', authenticate, checkSubscription, unblockStudent)
routes.delete('/api/:libraryId/students/:studentId', authenticate, checkSubscription, deleteStudent)
routes.get('/api/:libraryId/sudentsummary', authenticate, getStudentSummary)
routes.get('/api/:libraryId/getstudents', authenticate, getStudents)
routes.get('/api/:libraryId/getactivestudents', authenticate, getActiveStudents)
routes.get('/api/:libraryId/getexpiredstudents', authenticate, getExpiredStudents)
routes.get('/api/:libraryId/getexpiringstudents', authenticate, getExpiringStudents)
routes.get('/api/:libraryId/getpendingstudents', authenticate, getPendingStudents)
routes.get('/api/:libraryId/students/search', authenticate, globalSearchStudents)
routes.get('/api/:libraryId/students/:studentId/feerecords', authenticate, getStudentFeeRecords)

//API related to TASK
routes.post('/api/addtask', authenticate, checkSubscription, addTask)
routes.patch("/api/:taskId/completetask", authenticate, completeTask)
routes.delete("/api/:taskId/deletetask", authenticate, deleteTask)
routes.patch("/api/:taskId/edittask", authenticate, checkSubscription, editTask)
routes.get("/api/:libraryId/getalltask", authenticate, getAllTasks)

//API related to EXPENSE
routes.post('/api/addexpense', authenticate, checkSubscription, addExpense)
routes.delete('/api/deleteexpense/:expenseId', authenticate, deleteExpense)

//API related to DASHBOARD
routes.get("/api/:libraryId/dashboard", dashboard);
routes.get("/api/:libraryId/getmonthlyrevenue", getMonthlyRevenue);

//API related to PAYEMENT
routes.get("/api/:libraryId/getpayments", authenticate, getPayments);

//API related to SEATS
routes.post("/api/:libraryId/seats", createSeats); //create
routes.post("/api/:libraryId/seats/add", addSeats); //addMore
routes.get("/api/:libraryId/seats", listSeats); //getSeats
routes.get("/api/:libraryId/seats/config", authenticate, getSeatConfig);
routes.patch("/api/:libraryId/seats/config", authenticate, updateSeatConfig);
routes.patch("/api/seats/:seatId/status", updateSeatStatus); //status


//API related to SLOTS
routes.post("/api/:libraryId/slot", authenticate, checkSubscription, createSlot)
routes.get("/api/:libraryId/slots", listSlots)
routes.patch("/api/:slotId/status", updateSlotStatus)
routes.patch("/api/:slotId/editslot", authenticate, checkSubscription, editSlot)
routes.delete("/api/:slotId/deleteslot", deleteSlot)

// The booking-screen endpoint: shows every slot template + live seat availability
routes.get("/api/:libraryId/slots/availability", getAvailability);

// The seat-picker endpoint: shows every physical seat, booked vs available, for a chosen slot
routes.get("/api/:libraryId/seat-map", getSeatMapForSlot);

//API related to BOKING
routes.post("/reservations", createReservation);
routes.patch("/reservations/:reservationId/cancel", cancelReservation);
routes.post("/reservations/:reservationId/renew", renewReservation);
routes.patch("/reservations/:reservationId", editReservation);

//API related to IMAGE UPLOAD & DELETE
routes.post("/image", upload.single("image"), uploadImage);
routes.delete("/image/delete", authenticate, deleteImage);

//API related to BULK EXCEL IMPORT & TEMPLATE
routes.get("/api/:libraryId/download-student-template", downloadSampleTemplate);
routes.post("/api/:libraryId/bulk-import-students", excelUpload.single("file"), bulkImportStudents);
routes.delete("/api/:libraryId/clear-library-data", authenticate, clearLibraryData);

export default routes;
