import mongoose from "mongoose";

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Generic condition validator
export function ensure(condition, message, statusCode = 400) {
    if (!condition) {
        throw new AppError(message, statusCode);
    }
}

// Required field validator
export function requireField(value, fieldName) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        throw new AppError(`${fieldName} is required`);
    }
}

// Mongo ObjectId validator
export function validateObjectId(value, fieldName) {
    requireField(value, fieldName);

    if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new AppError(`Invalid ${fieldName}`);
    }
}

// Number validator
export function validateNumber(
    value,
    fieldName,
    {
        min = null,
        max = null,
        allowZero = true,
    } = {}
) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        throw new AppError(`Invalid ${fieldName}`);
    }

    if (!allowZero && number === 0) {
        throw new AppError(`${fieldName} cannot be zero`);
    }

    if (min !== null && number < min) {
        throw new AppError(
            `${fieldName} must be at least ${min}`
        );
    }

    if (max !== null && number > max) {
        throw new AppError(
            `${fieldName} must not exceed ${max}`
        );
    }

    return number;
}

// Date validator
export function validateDate(value, fieldName) {
    requireField(value, fieldName);

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new AppError(`Invalid ${fieldName}`);
    }

    return date;
}

// String validator
export function validateString(
    value,
    fieldName,
    {
        trim = true,
        minLength = 0,
        maxLength = null,
    } = {}
) {
    requireField(value, fieldName);

    let text = String(value);

    if (trim) {
        text = text.trim();
    }

    if (text.length < minLength) {
        throw new AppError(
            `${fieldName} must be at least ${minLength} characters`
        );
    }

    if (
        maxLength !== null &&
        text.length > maxLength
    ) {
        throw new AppError(
            `${fieldName} must not exceed ${maxLength} characters`
        );
    }

    return text;
}

export { AppError };