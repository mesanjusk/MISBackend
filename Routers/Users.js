const express = require("express");
const router = express.Router();
const Users = require("../Models/users");
const { v4: uuid } = require("uuid");

router.post("/login",async(req,res)=>{
  const{User_name, Password}=req.body

  try{
      const check=await Users.findOne({User_name: User_name})

      if(check){
          res.json("exist")
      }
      else{
          res.json("notexist")
      }

  }
  catch(e){
      res.json("fail")
  }

})

router.post("/addUser", async (req, res) => {
    const{User_name, Password, Mobile_number, User_group}=req.body

    try{
        const check=await Users.findOne({ Mobile_number: Mobile_number })
       
        if(check){
            res.json("exist")
        }
        else{
          const newUser = new Users({
            User_name,
            Password,
            Mobile_number,
            User_group,
            User_uuid: uuid()
        });
        await newUser.save(); 
        res.json("notexist");
        }

    }
    catch(e){
      console.error("Error saving user:", e);
      res.status(500).json("fail");
    }
  });



  router.get("/GetUserList", async (req, res) => {
    try {
      let data = await Users.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.User_name) });
      else res.json({ success: false, message: "User Not found" });
    } catch (err) {
      console.error("Error fetching users:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  router.put("/updateUser/:id", async (req, res) => {
    const { id } = req.params;
    const { User_name, Mobile_number, User_group } = req.body;

    try {
        const user = await Users.findByIdAndUpdate(id, {
            User_name,
            Password,
            Mobile_number,
            User_group
        }, { new: true }); 

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, result: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

  module.exports = router;