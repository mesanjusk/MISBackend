const express = require("express");
const router = express.Router();
const Tasks = require("../Models/tasks");
const { v4: uuid } = require("uuid");

router.post("/addTask", async (req, res) => {
    const{Task_name, Task_group}=req.body

    try{
        const check=await Tasks.findOne({ Task_name: Task_name })
       
        if(check){
            res.json("exist")
        }
        else{
          const newTask = new Tasks({
            Task_name,
            Task_group,
            Task_uuid: uuid()
        });
        await newTask.save(); 
        res.json("notexist");
        }

    }
    catch(e){
      console.error("Error saving Task:", e);
      res.status(500).json("fail");
    }
  });



  router.get("/GetTaskList", async (req, res) => {
    try {
      let data = await Tasks.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Task_name) });
      else res.json({ success: false, message: "Task Not found" });
    } catch (err) {
      console.error("Error fetching Task:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  router.put("/updateTask/:id", async (req, res) => {
    const { id } = req.params;
    const { Task_name, Task_group } = req.body;

    try {
        const user = await Tasks.findByIdAndUpdate(id, {
            Task_name,
            Task_group
        }, { new: true }); 

        if (!user) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        res.json({ success: true, result: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

  module.exports = router;