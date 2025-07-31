const express = require("express");
const router = express.Router();
const Itemgroup = require("../Models/itemgroup");
const { v4: uuid } = require("uuid");

router.post("/addItemgroup", async (req, res) => {
    const{ Item_group}=req.body

    try{
        const check=await Itemgroup.findOne({ Item_group: Item_group })


        if(check){
            res.json("exist")
        }
        else{
          const newGroup = new Itemgroup({
            Item_group,
            Item_group_uuid: uuid()
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



  router.get("/GetItemgroupList", async (req, res) => {
    try {
      let data = await Itemgroup.find({}).lean();
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Item_group) });
      else res.json({ success: false, message: "Item Group Not found" });
    } catch (err) {
      console.error("Error fetching group:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  
  module.exports = router;