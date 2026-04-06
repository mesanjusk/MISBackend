const express = require("express");
const router = express.Router();
const Vendors = require("../repositories/vendor");
const Items = require("../repositories/items");
const { v4: uuid } = require("uuid");

router.post("/addVendor", async (req, res) => {
    const{Order_Number, Order_uuid, Item_uuid}=req.body

    try{
        const check=await Vendors.findOne({ Order_Number: Order_Number })
       
        if(check){
            res.json("exist")
        }

        const matchedItem = await Items.findOne({ Item_name: Item_uuid });
        if (!matchedItem) {
          return res.status(400).json({ message: "Item not found" });
        }
    
        
          const newVendor = new Vendors({
            Order_Number,
            Order_uuid,
            Item_uuid: matchedItem.Item_uuid,
            Date: new Date().toISOString().split("T")[0],
            Vendor_uuid: uuid()
        })
        await newVendor.save(); 
        res.json("notexist");

    }
    catch(e){
      console.error("Error saving vendor:", e);
      res.status(500).json("fail");
    }
  });



  router.get("/GetVendorList", async (req, res) => {
    try {
      let data = await Vendors.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Order_Number) });
      else res.json({ success: false, message: "Vendor Not found" });
    } catch (err) {
      console.error("Error fetching users:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params; 

    try {
        const vendor = await Vendors.findById(id);  

        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: 'Vendor not found',
            });
        }

        res.status(200).json({
            success: true,
            result: vendor,
        });
    } catch (error) {
        console.error('Error fetching vendor:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching vendor',
            error: error.message,
        });
    }
});


  module.exports = router;