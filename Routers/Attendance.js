const express = require("express");
const router = express.Router();
const Attendance = require("../Models/attendance");
const { v4: uuid } = require("uuid");

router.post("/addCustomer", async (req, res) => {
    const{Attendance_Record_id, Employee_uuid, Date, Check_in_time, Check_out_time, total_hours, Status}=req.body

    try{
        const check=await Attendance.findOne({ Employee_uuid: Employee_uuid })
       
        if(check){
            res.json("exist")
        }
        else{
          const newRecord = new Attendance({
            Customer_name,
            Mobile_number,
            Customer_group,
            Customer_uuid: uuid()
        });
        await newRecord.save(); 
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

  router.put("/updateCustomer/:id", async (req, res) => {
    const { id } = req.params;
    const { Customer_name, Mobile_number, Customer_group } = req.body;

    try {
        const user = await Customers.findByIdAndUpdate(id, {
            Customer_name,
            Mobile_number,
            Customer_group
        }, { new: true }); 

        if (!user) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        res.json({ success: true, result: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

  module.exports = router;