const express = require("express");
const router = express.Router();
const Usergroup = require("../Models/usergroup");
const { v4: uuid } = require("uuid");

router.post("/addUsergroup", async (req, res) => {
    const{ User_group}=req.body

    try{
        const check=await Usergroup.findOne({ User_group: User_group })

        if(check){
            res.json("exist")
        }
        else{
          const newGroup = new Usergroup({
             User_group,
            User_group_uuid: uuid()
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



  router.get("/GetUsergroupList", async (req, res) => {
    try {
      let data = await Usergroup.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.User_group) });
      else res.json({ success: false, message: "User Group Not found" });
    } catch (err) {
      console.error("Error fetching group:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  
  module.exports = router;