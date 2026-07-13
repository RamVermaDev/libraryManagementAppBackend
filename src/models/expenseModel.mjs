import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
    {
        libraryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Library',
            required: true,
            index: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        category: {
            type: String,
            required: true,
            trim: true,
            enum: [
                'Salary',
                'Rent',
                'Electricity',
                'Internet',
                'Maintenance',
                'Marketing',
                'Other',
            ],
        },

        expenseDate: {
            type: Date,
            required: true,
            default: Date.now,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 200,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

expenseSchema.index({
    libraryId: 1,
    expenseDate: -1,
});

const expenseModel = mongoose.model('Expense', expenseSchema)

export { expenseModel }