const express = require("express");
const router = express.Router();
const Items = require("../Models/items");
const { v4: uuid } = require("uuid");

router.post("/addItem", async (req, res) => {
    const{Item_name, Item_group}=req.body

    try{
        const check=await Items.findOne({ Item_name: Item_name })
       
        if(check){
            res.json("exist")
        }
        else{
          const newItem = new Items({
            Item_name,
            Item_group,
            Item_uuid: uuid()
        });
        await newItem.save(); 
        res.json("notexist");
        }

    }
    catch(e){
      console.error("Error saving Item:", e);
      res.status(500).json("fail");
    }
  });



  router.get("/GetItemList", async (req, res) => {
    try {
      let data = await Items.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Item_name) });
      else res.json({ success: false, message: "Item Not found" });
    } catch (err) {
      console.error("Error fetching Item:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  router.put("/updateItem/:id", async (req, res) => {
    const { id } = req.params;
    const { Item_name, Item_group } = req.body;

    try {
        const user = await Items.findByIdAndUpdate(id, {
            Item_name,
            Item_group
        }, { new: true }); 

        if (!user) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        res.json({ success: true, result: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

  module.exports = router;