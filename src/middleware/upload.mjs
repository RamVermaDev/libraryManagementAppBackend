import multer from "multer";

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },

    fileFilter(req, file, cb) {
        const isImageMime = file.mimetype && file.mimetype.startsWith("image/");
        const isImageExt = /\.(jpg|jpeg|png|webp|gif|heic|heif|bmp)$/i.test(file.originalname || "");

        if (!isImageMime && !isImageExt) {
            return cb(new Error("Only image files are allowed."));
        }

        cb(null, true);
    },
});

const excelUpload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },

    fileFilter(req, file, cb) {
        const isExcel = /\.(xlsx|xls)$/i.test(file.originalname || "");
        if (!isExcel) {
            return cb(new Error("Only Excel files (.xlsx, .xls) are allowed."));
        }
        cb(null, true);
    },
});

export  {upload, excelUpload};