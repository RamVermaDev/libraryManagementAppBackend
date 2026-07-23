import express from "express";
import upload from "../middleware/upload.mjs";
import { uploadImage, uploadStudentImage } from "../controllers/uploadController.mjs";


const uploadRoute = express.Router();

console.log("Setting up upload routes...");

uploadRoute.post("/image", upload.single("image"), uploadImage);
uploadRoute.put("/student/:studentId/image", upload.single("image"), uploadStudentImage);

export  {uploadRoute};