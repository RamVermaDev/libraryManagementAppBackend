import express from 'express'
import { getCurrentUser, loginUser, sendEmailVerificationOtp, signupUser, updateProfile, verifyEmailOtp } from './controllers/userController.mjs'
import { createLibrary, getOwnerLibraries } from './controllers/libraryController.mjs'
import { authenticate } from './auth/authorization.mjs'

const routes = express.Router()

routes.get('/', (req, res) => {
    return res.send('Hello Routes')
})

routes.post('/api/register', signupUser)
routes.post('/api/login', loginUser)
routes.put('/api/profile', authenticate, updateProfile)
routes.post('/api/verify-email', authenticate, sendEmailVerificationOtp)
routes.post('/api/otp-verify', authenticate, verifyEmailOtp)
routes.get('/api/verify-token', authenticate, getCurrentUser)

routes.post('/api/createlibrary', authenticate, createLibrary )
routes.get('/api/my-libraries', authenticate, getOwnerLibraries)

export default routes;
