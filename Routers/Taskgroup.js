const express = require("express");
const router = express.Router();
const Taskgroup = require("../Models/taskgroup");
const { v4: uuid } = require("uuid");

router.post("/addTaskgroup", async (req, res) => {
    const{ Task_group}=req.body

    try{
        const check=await Taskgroup.findOne({ Task_group: Task_group })

        if(check){
            res.json("exist")
        }
        else{
          const newGroup = new Taskgroup({
            Task_group,
            Task_group_uuid: uuid()
        });
        await newGroup.save(); 
        res.json("notexist");
        }

    }
    catch(e){
      console.error("Error saving group:", e);
      res.status(500).json("fail");
    }
  });



  router.get("/GetTaskgroupList", async (req, res) => {
    try {
      let data = await Taskgroup.find({}).lean();
  
      if (data.length) {
        res.json({ success: true, result: data });
      } else {
        res.json({ success: false, message: "Task Group Not found" });
      }
    } catch (err) {
      console.error("Error fetching group:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  
  module.exports = router;