const express = require("express");
const router = express.Router();
const Payment_mode = require("../Models/payment_mode");
const { v4: uuid } = require("uuid");

router.post("/addPayment", async (req, res) => {
    const{ Payment_name }=req.body

    try{
        const check=await Payment_mode.findOne({ Payment_name: Payment_name })


        if(check){
            res.json("exist")
        }
        else{
          const newPayment = new Payment_mode({
            Payment_name,
            Payment_mode_uuid: uuid()
        });
        await newPayment.save(); 
        res.json("notexist");
        }

    }
    catch(e){
      console.error("Error saving Payment:", e);
      res.status(500).json("fail");
    }
  });

  router.get("/GetPaymentList", async (req, res) => {
    try {
      let data = await Payment_mode.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Payment_name) });
      else res.json({ success: false, message: "Payment Not found" });
    } catch (err) {
      console.error("Error fetching payment:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  module.exports = router;