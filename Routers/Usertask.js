const express = require("express");
const router = express.Router();
const Usertasks = require("../Models/usertask");
const { v4: uuid } = require("uuid");

router.post("/addUsertask", async (req, res) => {
  const {
    Usertask_name, User, Deadline, Remark
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
        Usertask_uuid: uuid(),
        Deadline,
        Remark,
        Status: "Pending"
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

router.post('/send-message', async (req, res) => {
  const { mobile, userName, type } = req.body;

  if (!mobile || !userName || !type) {
    return res.status(400).json({ error: 'Missing required fields: mobile, userName, type' });
  }

  const apiKey = '9d8db6b2a1584a489e7270a9bbe1b7a0';

  const encodedMobile = encodeURIComponent(mobile);
  const encodedMsg = encodeURIComponent(`${type} ${userName}`);

  const url = `http://148.251.129.118/wapp/api/send?apikey=${apiKey}&mobile=${encodedMobile}&msg=${encodedMsg}`;

  try {
    const response = await fetch(url);
    const data = await response.text(); 
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to send message' });
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

router.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const { Usertask_name, Usertask_Number, Deadline, Remark, Status } = req.body;

  try {
      const user = await Usertasks.findByIdAndUpdate(id, {
        Usertask_name,
        Usertask_Number,
        Deadline,
        Remark, 
        Status
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
