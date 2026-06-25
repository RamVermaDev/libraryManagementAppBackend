import express from 'express'
import routes from './src/routes.mjs'
import mongoose from 'mongoose'

import { PORT, MONGODB_URI } from './config.mjs'

const app = express()

mongoose.connect(MONGODB_URI).then(() => {
    console.log('Mongoose is Connected')
}).catch((error) => {
    console.error(error.message)
})

app.use(express.json())

app.use('/', routes)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});