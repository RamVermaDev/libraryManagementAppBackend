import cloudinary from '../../config/cloudinary.mjs'
import streamifier from "streamifier"
import { studentModel } from '../models/studentModel.mjs';

export const uploadImage = async (req, res) => {
    console.log("Uploading image...");

    try {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Image is required."
            });
        }

        const result = await new Promise((resolve, reject) => {

            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: "library-management",
                    type: "authenticated",
                    resource_type: "image",
                },

                (error, result) => {

                    if (error) return reject(error);

                    resolve(result);

                }
            );

            streamifier.createReadStream(req.file.buffer).pipe(stream);

        });

        return res.status(200).json({
            success: true,
            publicId: result.public_id,
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Upload failed."
        });
    }
};


export const uploadStudentImage = async (req, res) => {
    try {
        console.log("Uploading student image...");

        const { studentId } = req.params;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Image is required."
            });
        }

        const student = await studentModel.findById(studentId);

        if (!student) {
            console.error(`Student with ID ${studentId} not found.`);
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        // Delete previous image (optional)
        if (student.photoPublicId) {
            try {
                await cloudinary.uploader.destroy(
                    student.photoPublicId,
                    {
                        type: "authenticated",
                        resource_type: "image"
                    }
                );
            } catch (e) {
                console.log("Old image not deleted");
            }
        }

        // Upload new image
        const uploadResult = await new Promise((resolve, reject) => {

            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: "library-management/students",
                    type: "authenticated",
                    resource_type: "image",
                },
                (error, result) => {

                    if (error) return reject(error);

                    resolve(result);
                }
            );

            streamifier
                .createReadStream(req.file.buffer)
                .pipe(uploadStream);

        });

        // Save only public id
        student.photoPublicId = uploadResult.public_id;

        await student.save();

        // Generate signed url
        const photoUrl = cloudinary.url(student.photoPublicId, {
            type: "authenticated",
            sign_url: true,
            secure: true,
            expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), //7 days
            //expires_at: Math.floor(Date.now() / 1000) + 86400 // 24 hours
        });

        return res.status(200).json({
            success: true,
            message: "Image uploaded successfully.",
            //student,
            photoUrl
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Image upload failed."
        });

    }
};