import express from 'express'
import routes from './src/routes.mjs'
import mongoose from 'mongoose'
import cors from 'cors'

import { PORT, MONGODB_URI } from './config.mjs'

const app = express()

app.use(cors({
  origin: true,
  credentials: true
}));

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