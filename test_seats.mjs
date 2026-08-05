// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// import { seatModel } from './src/models/seatModel.mjs';

// dotenv.config();

// async function run() {
//   await mongoose.connect(process.env.MONGODB_URI);
//   console.log("Connected to MongoDB");

//   const seats = await seatModel.find({}).limit(5).sort({ createdAt: -1 });
//   console.log("Recent seats:", seats.map(s => ({
//     id: s._id,
//     libraryId: s.libraryId,
//     label: s.label,
//     seatNumber: s.seatNumber
//   })));

//   if (seats.length > 0) {
//     const libraryId = seats[0].libraryId;
//     const existingSeats = await seatModel.find({ libraryId }).sort({ seatNumber: 1 });
//     console.log(`Found ${existingSeats.length} seats for library ${libraryId}`);
    
//     let targetPrefix = 'S';
//     let targetTotal = 50;
    
//     // Simulate what happens in service
//     console.log("Updating prefix...");
//     const effectivePrefix = targetPrefix || (existingSeats.length > 0 ? (String(existingSeats[0].label).match(/^([A-Za-z0-9]+)/)?.[1] ?? 'A') : 'A');
//     if (targetPrefix && existingSeats.length > 0) {
//       for (const seat of existingSeats) {
//         if (seat.seatNumber <= targetTotal) {
//           seat.label = `${effectivePrefix}-${seat.seatNumber}`;
//           await seat.save();
//         }
//       }
//     }
    
//     const updatedSeats = await seatModel.find({ libraryId }).limit(5).sort({ seatNumber: 1 }).lean();
//     console.log("Updated seats:", updatedSeats.map(s => s.label));
//   }

//   process.exit(0);
// }

// run().catch(console.error);
