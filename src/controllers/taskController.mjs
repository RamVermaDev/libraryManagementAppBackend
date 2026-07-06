import mongoose from "mongoose";
import { libraryModel } from "../models/libraryModel.mjs";
import { taskModel } from "../models/taskModel.mjs";


const addTask = async (req, res) => {
  try {
    
    const userId = req.user.id;

    console.log('Happen1');

    const {
      libraryId,
      title,
      description,
      dueDate,
      urgency,
    } = req.body;


    // 1. Validate required fields
    if (!libraryId || !title || !description || !dueDate) {
      return res.status(400).json({
        success: false,
        message: "Library ID, title, description and due date are required",
      });
    }

    // 2. Validate library ID format
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 3. Clean input
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (cleanTitle.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Task title must be at least 4 characters",
      });
    }

    // 4. Validate due date
    const parsedDueDate = new Date(dueDate);

    if (Number.isNaN(parsedDueDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid due date",
      });
    }

    // 5. Validate urgency
    const allowedUrgencies = ["low", "medium", "high"];
    const cleanUrgency = urgency?.toLowerCase() ?? "low";

    if (!allowedUrgencies.includes(cleanUrgency)) {
      return res.status(400).json({
        success: false,
        message: "Urgency must be low, medium or high",
      });
    }


    // 6. Verify that the logged-in user owns this library
    const library = await libraryModel.findOne({
      _id: libraryId,
      ownerId: userId,
    }).select("_id");

    if (!library) {
      return res.status(404).json({
        success: false,
        message: "Library not found or access denied",
      });
    }
    

    // 7. Create task
    const task = await taskModel.create({
      libraryId: library._id,
      title: cleanTitle,
      description: cleanDescription,
      dueDate: parsedDueDate,
      urgency: cleanUrgency,
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
       task: task,
    });
  } catch (error) {
    console.error("Add Task Error:", error);

    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)
        .map((item) => item.message)
        .join(", ");

      return res.status(400).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const completeTask = async (req, res) => {
  try {
    // Authentication required in production
    const userId = req.user.id;

    const { taskId } = req.params;
    const { libraryId } = req.body;

    // 1. Validate required fields
    if (!libraryId) {
      return res.status(400).json({
        success: false,
        message: "Library ID is required",
      });
    }

    // 2. Validate IDs
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 3. Verify library exists and belongs to user
    const library = await libraryModel
      .findOne({
        _id: libraryId,

        // Uncomment after authentication is enabled
        ownerId: userId,
      })
      .select("_id");

    if (!library) {
      return res.status(404).json({
        success: false,
        message: "Library not found or access denied",
      });
    }

    // 4. Complete only a task belonging to this library
    const task = await taskModel.findOneAndUpdate(
      {
        _id: taskId,
        libraryId: library._id,
        isCompleted: false,
      },
      {
        $set: {
          isCompleted: true,
          completedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or already completed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task completed successfully",
      task: task,
    });
  } catch (error) {
    console.error("Complete Task Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const deleteTask = async (req, res) => {
  try {
    
    // Authentication required in production
    const userId = req.user.id;
    

    const { taskId } = req.params;
    const { libraryId } = req.body;
    console.log('deletr')

    // 1. Validate required fields
    if (!libraryId) {
      return res.status(400).json({
        success: false,
        message: "Library ID is required",
      });
    }

    // 2. Validate task ID
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    // 3. Validate library ID
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 4. Verify library exists and belongs to user
    const library = await libraryModel
      .findOne({
        _id: libraryId,

        // Uncomment after authentication is enabled
        ownerId: userId,
      })
      .select("_id");

    if (!library) {
      return res.status(404).json({
        success: false,
        message: "Library not found or access denied",
      });
    }

    // 5. Delete only if task belongs to this library
    const deletedTask = await taskModel.findOneAndDelete({
      _id: taskId,
      libraryId: library._id,
    });

    if (!deletedTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      task: deletedTask,
    });
  } catch (error) {
    console.error("Delete Task Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const editTask = async (req, res) => {
  try {
    // Authentication required in production
    const userId = req.user.id;

    const { taskId } = req.params;

    const {
      libraryId,
      title,
      description,
      dueDate,
      urgency,
    } = req.body;

    // 1. Validate required fields
    if (!libraryId || !title || !description || !dueDate) {
      return res.status(400).json({
        success: false,
        message:
          "Library ID, title, description and due date are required",
      });
    }

    // 2. Validate task ID
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    // 3. Validate library ID
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 4. Clean input
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (cleanTitle.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Task title must be at least 4 characters",
      });
    }

    // 5. Validate due date
    const parsedDueDate = new Date(dueDate);

    if (Number.isNaN(parsedDueDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid due date",
      });
    }

    // 6. Validate urgency
    const allowedUrgencies = ["low", "medium", "high"];

    const cleanUrgency = urgency?.toLowerCase() ?? "low";

    if (!allowedUrgencies.includes(cleanUrgency)) {
      return res.status(400).json({
        success: false,
        message: "Urgency must be low, medium or high",
      });
    }

    // 7. Verify library exists and belongs to user
    const library = await libraryModel
      .findOne({
        _id: libraryId,

        // Uncomment after authentication is enabled
        ownerId: userId,
      })
      .select("_id");

    if (!library) {
      return res.status(404).json({
        success: false,
        message: "Library not found or access denied",
      });
    }

    // 8. Find the task first
    const task = await taskModel.findOne({
      _id: taskId,
      libraryId: library._id,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // 9. Completed tasks cannot be edited
    if (task.isCompleted) {
      return res.status(409).json({
        success: false,
        message: "Completed task cannot be edited",
      });
    }

    // 10. Update task
    task.title = cleanTitle;
    task.description = cleanDescription;
    task.dueDate = parsedDueDate;
    task.urgency = cleanUrgency;

    await task.save();

    return res.status(200).json({
      success: true,
      message: "Task updated successfully",
      task: task,
    });
  } catch (error) {
    console.error("Edit Task Error:", error);

    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)
        .map((item) => item.message)
        .join(", ");

      return res.status(400).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAllTasks = async (req, res) => {
  try {
    // Authentication required in production
    const userId = req.user.id;

    const { libraryId } = req.params;

    // 1. Validate library ID
    if (!mongoose.Types.ObjectId.isValid(libraryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library ID",
      });
    }

    // 2. Verify library exists and belongs to user
    const library = await libraryModel
      .findOne({
        _id: libraryId,

        // Uncomment after authentication is enabled
        ownerId: userId,
      })
      .select("_id");

      console.log(library)

    if (!library) {
      return res.status(404).json({
        success: false,
        message: "Library not found or access denied",
      });
    }

    // 3. Get all tasks belonging to this library
    const tasks = await taskModel
      .find({
        libraryId: library._id,
      })
      .sort({
        isCompleted: 1,
        dueDate: 1,
      });

    // 4. Return tasks

    return res.status(200).json({
      success: true,
      message: "Tasks fetched successfully",
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    console.error("Get All Tasks Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export {addTask, completeTask, deleteTask, editTask, getAllTasks}