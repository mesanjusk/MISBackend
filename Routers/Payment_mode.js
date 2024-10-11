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

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const payment = await Payment_mode.findById(id);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found',
            });
        }
        res.status(200).json({
            success: true,
            result: payment,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching payment',
            error: error.message,
        });
    }
});


router.put('/update/:id', async (req, res) => {
  const { id } = req.params;  
  const { Payment_name } = req.body;

  try {
    const updatedPayment = await Payment_mode.findOneAndUpdate(
      { _id: id }, 
      { Payment_name },
      { new: true }  
    );

    if (!updatedPayment) {
      return res.status(404).json({
        success: false,
        message: 'payment not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'payment updated successfully',
      result: updatedPayment,
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment',
      error: error.message,
    });
  }
});



router.delete('/DeletePayment/:paymentUuid', async (req, res) => {
  const { paymentUuid } = req.params;
  try {
      const result = await Payment_mode.findOneAndDelete({ Payment_uuid: paymentUuid });
      if (!result) {
          return res.status(404).json({ success: false, message: 'payment not found' });
      }
      res.json({ success: true, message: 'payment deleted successfully' });
  } catch (error) {
      console.error('Error deleting payment:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

  module.exports = router;