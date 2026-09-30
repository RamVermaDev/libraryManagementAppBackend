import express from "express";
import {upload} from "../middleware/upload.mjs";
import { deleteImage, uploadImage, uploadStudentImage, uploadLibraryLogo } from "../controllers/uploadController.mjs";
import { authenticate } from "../auth/authorization.mjs";

const uploadRoute = express.Router();

console.log("Setting up upload routes...");

uploadRoute.post("/image", upload.single("image"), uploadImage);
uploadRoute.delete("/image", authenticate, deleteImage);
uploadRoute.put("/student/:studentId/image", upload.single("image"), uploadStudentImage);
uploadRoute.put("/library/:libraryId/logo", authenticate, upload.single("image"), uploadLibraryLogo);

export { uploadRoute };