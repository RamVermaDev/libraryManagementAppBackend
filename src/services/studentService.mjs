import { libraryModel } from "../models/libraryModel.mjs";
import { studentModel } from "../models/studentModel.mjs";
import { AppError, validateObjectId, validateString } from "../helper/validatorHelper.mjs";

const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

export async function updateStudentProfileService({
    userId,
    libraryId,
    studentId,
    name,
    phone,
    idProof,
}) {
    validateObjectId(libraryId, "Library Id");
    validateObjectId(studentId, "Student Id");

    const normalizedName = validateString(name, "Student name", {
        minLength: 2,
        maxLength: 100,
    });

    const normalizedPhone = validateString(phone, "Phone number");

    if (!INDIAN_PHONE_REGEX.test(normalizedPhone)) {
        throw new AppError("Enter a valid Indian phone number", 400);
    }

    const normalizedIdProof = idProof === undefined || idProof === null
        ? null
        : String(idProof).trim() || null;

    const library = await libraryModel
        .findOne({
            _id: libraryId,
            ownerId: userId,
        })
        .select("_id")
        .lean();

    if (!library) {
        throw new AppError("You do not have access to this library", 403);
    }

    const student = await studentModel
        .findOne({
            _id: studentId,
            libraryId,
        })
        .select("_id phone")
        .lean();

    if (!student) {
        throw new AppError("Student not found", 404);
    }

    if (student.phone !== normalizedPhone) {
        const duplicateStudent = await studentModel
            .findOne({
                libraryId,
                phone: normalizedPhone,
                _id: { $ne: studentId },
            })
            .select("_id")
            .lean();

        if (duplicateStudent) {
            throw new AppError("Student with this phone number already exists", 409);
        }
    }

    return studentModel.findOneAndUpdate(
        {
            _id: studentId,
            libraryId,
        },
        {
            $set: {
                name: normalizedName,
                phone: normalizedPhone,
                idProof: normalizedIdProof,
            },
        },
        {
            new: true,
            runValidators: true,
        }
    );
}
