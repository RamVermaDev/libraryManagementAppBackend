import express from 'express'
import routes from './src/routes.mjs'
import mongoose from 'mongoose'
import cors from 'cors'

import { PORT, MONGODB_URI } from './config.mjs'
import { uploadRoute } from './src/routes/uploadRoute.mjs'

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

console.log("Setting up upload index...");

app.use(express.json())

app.use('/', routes)
app.use("/api/upload", uploadRoute);

// Global JSON Error Handler
// app.use((err, req, res, next) => {
//   if (err) {
//     console.error("Server error:", err.message || err);
//     return res.status(err.status || 400).json({
//       success: false,
//       message: err.message || "An unexpected error occurred",
//     });
//   }
//   next();
// });

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});