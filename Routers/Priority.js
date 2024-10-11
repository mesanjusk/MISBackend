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

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const priority = await Priority.findById(id);
        if (!priority) {
            return res.status(404).json({
                success: false,
                message: 'Priority not found',
            });
        }
        res.status(200).json({
            success: true,
            result: priority,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching priority',
            error: error.message,
        });
    }
});


router.put('/update/:id', async (req, res) => {
  const { id } = req.params;  
  const { Priority_name } = req.body;

  try {
    const updatedPriority = await Priority.findOneAndUpdate(
      { _id: id }, 
      { Priority_name },
      { new: true }  
    );

    if (!updatedPriority) {
      return res.status(404).json({
        success: false,
        message: 'Priority not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Priority updated successfully',
      result: updatedPriority,
    });
  } catch (error) {
    console.error('Error updating Priority:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating Priority',
      error: error.message,
    });
  }
});



router.delete('/DeletePriority/:priorityUuid', async (req, res) => {
  const { priorityUuid } = req.params;
  try {
      const result = await Priority.findOneAndDelete({ Priority_uuid: priorityUuid });
      if (!result) {
          return res.status(404).json({ success: false, message: 'Priority not found' });
      }
      res.json({ success: true, message: 'Priority deleted successfully' });
  } catch (error) {
      console.error('Error deleting Priority:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

  module.exports = router;