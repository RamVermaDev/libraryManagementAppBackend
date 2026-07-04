import mongoose from "mongoose";

const { Schema, model } = mongoose;

const taskSchema = new Schema(
  {
    libraryId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      required: [true, "Library ID is required"],
      index: true,
    },

    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      minlength: [4, "Task title must be at least 4 characters"],
      maxlength: [100, "Task title cannot exceed 100 characters"],
    },

    description: {
      type: String,
      required: [true, "Task description is required"],
      trim: true,
      maxlength: [500, "Task description cannot exceed 500 characters"],
    },

    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },

    urgency: {
      type: String,
      enum: {
        values: ["low", "medium", "high"],
        message: "{VALUE} is not a valid urgency",
      },
      default: "low",
      lowercase: true,
      trim: true,
    },

    isCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

taskSchema.index({
  libraryId: 1,
  isCompleted: 1,
  dueDate: 1,
});

taskSchema.index({
  libraryId: 1,
  urgency: 1,
});

taskSchema.pre("save", function () {
  if (this.isModified("isCompleted")) {
    this.completedAt = this.isCompleted ? new Date() : null;
  }
});

const taskModel = model("Task", taskSchema);

export {taskModel}