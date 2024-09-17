const express = require("express");
const router = express.Router();
const Customers = require("../Models/customer");
const { v4: uuid } = require("uuid");

router.post("/addCustomer", async (req, res) => {
    const{Customer_name, Mobile_number, Customer_group}=req.body

    try{
        const check=await Customers.findOne({ Mobile_number: Mobile_number })
       
        if(check){
            res.json("exist")
        }
        else{
          const newCustomer = new Customers({
            Customer_name,
            Mobile_number,
            Customer_group,
            Customer_uuid: uuid()
        });
        await newCustomer.save(); 
        res.json("notexist");
        }

    }
    catch(e){
      console.error("Error saving customer:", e);
      res.status(500).json("fail");
    }
  });



  router.get("/GetCustomersList", async (req, res) => {
    try {
      let data = await Customers.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Customer_name) });
      else res.json({ success: false, message: "Customers Not found" });
    } catch (err) {
      console.error("Error fetching users:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params; 

    try {
        const customer = await Customers.findById(id);  

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found',
            });
        }

        res.status(200).json({
            success: true,
            result: customer,
        });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching customer',
            error: error.message,
        });
    }
});

router.put('/update/:id', async (req, res) => {
  const { id } = req.params;  
  const { Customer_name, Mobile_number, Customer_group } = req.body;

  try {
    const updatedCustomer = await Customers.findOneAndUpdate(
      { _id: id }, 
      { Customer_name, Mobile_number, Customer_group },
      { new: true }  
    );

    if (!updatedCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      result: updatedCustomer,
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating customer',
      error: error.message,
    });
  }
});



router.delete('/DeleteCustomer/:mobile', async (req, res) => {
  const { mobile } = req.params; 
  try {
    const deletedCustomer = await Customers.findOneAndDelete({ Mobile_number: mobile });

    if (!deletedCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully',
      result: deletedCustomer,
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting customer',
      error: error.message,
    });
  }
});


  module.exports = router;