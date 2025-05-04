// src/routes/tasks.js

const express = require("express");
const router = express.Router();
const Tasks = require("../Models/tasks");
const { v4: uuid } = require("uuid");

router.post("/addTask", async (req, res) => {
    const { Task_name, Task_group } = req.body;

    try {
        const check = await Tasks.findOne({ Task_name: Task_name });

        if (check) {
            res.json("exist");
        } else {
            const newTask = new Tasks({
                Task_name,
                Task_group,
                Task_uuid: uuid(),
                Status: "Pending"  // Ensure Status is set to "Pending"
            });
            await newTask.save();
            res.json("notexist");
        }
    } catch (e) {
        console.error("Error saving Task:", e);
        res.status(500).json({ success: false, message: "Error saving task", error: e.message });
    }
});

router.get("/GetTaskList", async (req, res) => {
    try {
        // Filter tasks that have Status: "Pending"
        let data = await Tasks.find({ Status: "Pending" });

        if (data.length) {
            res.json({ success: true, result: data });
        } else {
            res.json({ success: false, message: "No pending tasks found" });
        }
    } catch (err) {
        console.error("Error fetching tasks:", err);
        res.status(500).json({ success: false, message: err });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const task = await Tasks.findById(id);

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found',
            });
        }

        res.status(200).json({
            success: true,
            result: task,
        });
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching task',
            error: error.message,
        });
    }
});

router.put("/update/:id", async (req, res) => {
    const { id } = req.params;
    const { Task_name, Task_group } = req.body;

    try {
        const task = await Tasks.findByIdAndUpdate(id, {
            Task_name,
            Task_group
        }, { new: true });

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        res.json({ success: true, result: task });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.delete('/Delete/:taskId', async (req, res) => {
    const { taskId } = req.params;
    try {
        const task = await Tasks.findByIdAndDelete(taskId);
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        return res.status(200).json({ success: true, message: 'Task deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deleting task' });
    }
});

module.exports = router;
