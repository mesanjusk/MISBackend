const express = require("express");
const router = express.Router();
const Priority = require("../Models/priority");
const { v4: uuid } = require("uuid");

router.post("/addPriority", async (req, res) => {
    const{Priority_name}=req.body

    try{
        const check=await Priority.findOne({ Priority_name: Priority_name })
       
        if(check){
            res.json("exist")
        }
        else{
          const newPriority = new Priority({
            Priority_name,
            Priority_uuid: uuid()
        });
        await newPriority.save(); 
        res.json("notexist");
        }

    }
    catch(e){
      console.error("Error saving Item:", e);
      res.status(500).json("fail");
    }
  });



  router.get("/GetPriorityList", async (req, res) => {
    try {
      let data = await Priority.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Priority_name) });
      else res.json({ success: false, message: "Priority Not found" });
    } catch (err) {
      console.error("Error fetching Priority:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  module.exports = router;