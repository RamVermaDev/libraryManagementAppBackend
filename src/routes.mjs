import express from 'express'
import { getCurrentUser, loginUser, sendEmailVerificationOtp, signupUser, updateProfile, verifyEmailOtp } from './controllers/userController.mjs'
import { createLibrary, getOwnerLibraries } from './controllers/libraryController.mjs'
import { authenticate } from './auth/authorization.mjs'
import { addStudent, getActiveStudents, getExpiredStudents, getExpiringStudents, getStudents, getStudentSummary } from './controllers/studentController.mjs'
import { addTask, completeTask, deleteTask, editTask, getAllTasks } from './controllers/taskController.mjs'
import { addExpense, deleteExpense } from './controllers/expenseController.mjs'
import { dashboard, getMonthlyRevenue } from './revenueControllers/revenue.controller.mjs'
import { getPayments } from './controllers/payementController.mjs'


const routes = express.Router()


routes.get('/', (req, res) => {
    return res.send('Hello Routes')
})

//User Related API
routes.post('/api/register', signupUser)
routes.post('/api/login', loginUser)
routes.put('/api/profile', authenticate, updateProfile)
routes.post('/api/verify-email', authenticate, sendEmailVerificationOtp)
routes.post('/api/otp-verify', authenticate, verifyEmailOtp)
routes.get('/api/verify-token', authenticate, getCurrentUser)

//Library related API
routes.post('/api/createlibrary', authenticate, createLibrary)
routes.get('/api/my-libraries', authenticate, getOwnerLibraries)

//Student related API
routes.post('/api/addstudent', authenticate, addStudent)
routes.get('/api/:libraryId/sudentsummary', authenticate, getStudentSummary)
routes.get('/api/:libraryId/getstudents', authenticate, getStudents)
routes.get('/api/:libraryId/getactivestudents', authenticate, getActiveStudents)
routes.get('/api/:libraryId/getexpiredstudents', authenticate, getExpiredStudents)
routes.get('/api/:libraryId/getexpiringstudents', authenticate, getExpiringStudents)

//API related to TASK
routes.post('/api/addtask', authenticate, addTask)
routes.patch("/api/:taskId/completetask", authenticate, completeTask)
routes.delete("/api/:taskId/deletetask", authenticate, deleteTask)
routes.patch("/api/:taskId/edittask", authenticate, editTask)
routes.get("/api/:libraryId/getalltask", authenticate, getAllTasks)

//API related to EXPENSE
routes.post('/api/addexpense', authenticate, addExpense)
routes.delete('/api/deleteexpense/:expenseId', authenticate, deleteExpense)

//API related to DASHBOARD
routes.get("/api/:libraryId/dashboard", dashboard);
routes.get("/api/:libraryId/getmonthlyrevenue", getMonthlyRevenue);

//API related to PAYEMENT
routes.get("/api/:libraryId/getpayments", authenticate, getPayments);

export default routes;
