import express from 'express'
import { loginUser, signupUser, updateProfile } from './controllers/userController.mjs'
import { createLibrary } from './controllers/libraryController.mjs'
import { authenticate } from './auth/authorization.mjs'

const routes = express.Router()

routes.get('/', (req, res) => {
    return res.send('Hello Routes')
})

routes.post('/api/register', signupUser)
routes.post('/api/login', loginUser)
routes.put('/api/profile', authenticate, updateProfile)

routes.post('/api/createlibrary', authenticate, createLibrary )

export default routes;
