const express = require("express");
const router = express.Router();
const Items = require("../repositories/items");
const { v4: uuid } = require("uuid");
const Transaction = require("../repositories/transaction");
const Order = require("../repositories/order");

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
      const [data, orders, transactions] = await Promise.all([
        Items.find({}),
        Order.find({}, 'Item'),
        Transaction.find({}, 'Item')
      ]);

      const usedFromOrders = new Set(orders.map((l) => l.Item));
      const usedFromTransactions = new Set(transactions.map((t) => t.Item));

      const allUsed = new Set([...usedFromOrders, ...usedFromTransactions]);

      const itemWithUsage = data.map((i) => ({
            ...i._doc,
            isUsed: allUsed.has(i.Item_name),
        }));
  
       res.json({
            success: true,
            result: itemWithUsage,
        });
    } catch (err) {
      console.error("Error fetching Item:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params; 

    try {
        const item = await Items.findById(id);  

        if (!item) {
            return res.status(404).json({
                success: false,
                message: ' Item not found',
            });
        }

        res.status(200).json({
            success: true,
            result: item,
        });
    } catch (error) {
        console.error('Error fetching item:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching item',
            error: error.message,
        });
    }
});

  router.put("/update/:id", async (req, res) => {
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

router.delete('/Delete/:itemId', async (req, res) => {
  const { itemId } = req.params;
  try {
      const item = await Items.findByIdAndDelete(itemId);
      if (!item) {
          return res.status(404).json({ success: false, message: 'Item not found' });
      }
      return res.status(200).json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
      return res.status(500).json({ success: false, message: 'Error deleting item' });
  }
});



  module.exports = router;
