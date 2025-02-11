const express = require("express");
const router = express.Router();
const Usertasks = require("../Models/usertask");
const { v4: uuid } = require("uuid");

router.post("/addUsertask", async (req, res) => {
  const {
    Usertask_name, User
  } = req.body;
 
  try{
    const lastUsertask = await Usertasks.findOne().sort({ Usertask_Number: -1 });
    const newTaskNumber = lastUsertask ? lastUsertask.Usertask_Number + 1 : 1;
    const data = await Usertasks.findOne({ Usertask_name: Usertask_name })
   
    if(data){
        res.json("exist")
    }
    else{
      const newTask = new Usertasks({
        Usertask_name,
        User,
        Usertask_Number: newTaskNumber,
        Date: new Date().toISOString().split("T")[0],
        Time: new Date().toLocaleTimeString("en-US", { hour12: false }),
        Usertask_uuid: uuid()
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


router.get("/GetUsertaskList", async (req, res) => {
    try {
        let data = await Usertasks.find({});
    
        if (data.length)
          res.json({ success: true, result: data.filter((a) => a.Usertask_name) });
        else res.json({ success: false, message: "Task Not found" });
      } catch (err) {
        console.error("Error fetching Task:", err);
          res.status(500).json({ success: false, message: err });
      }
});



  module.exports = router;
