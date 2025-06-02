const express = require("express");
const router = express.Router();
const Users = require("../Models/users");
const { v4: uuid } = require("uuid");
const jwt = require('jsonwebtoken');
const Transaction = require("../Models/transaction");
const Order = require("../Models/order");


router.post("/login", async (req, res) => {
  const { User_name, Password } = req.body;

  try {
      const user = await Users.findOne({ User_name });

      if (!user) {
          return res.json({ status: "notexist" });
      }

      if (Password === user.Password) {
          res.json({
              status: "exist",
              userGroup: user.User_group,
              userMobile: user.Mobile_number,
          });
      } else {
          res.json({ status: "invalid", message: "Invalid credentials." });
      }
  } catch (e) {
      console.error("Error during login:", e);
      res.json({ status: "fail" });
  }
});

router.post("/addUser", async (req, res) => {
    const{User_name, Password, Mobile_number, Amount, User_group}=req.body

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
            Amount,
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
      let orders = await Order.find({}, 'Status');
      let transactions = await Transaction.find({}, 'Created_by');

      const usedFromOrders = new Set();
        for (const od of orders) {
            for (const entry of od.Status) {
                usedFromOrders.add(entry.Assigned);
            }
        }
      const usedFromTransactions = new Set(transactions.map((t) => t.Created_by));

      const allUsed = new Set([...usedFromOrders, ...usedFromTransactions]);

      const userWithUsage = data.map((user) => ({
            ...user._doc,
            isUsed: allUsed.has(user.User_name),
        }));
     res.json({
            success: true,
            result: userWithUsage,
        });
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

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  console.log('Token:', token); 
  if (!token) return res.sendStatus(401); 

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) {
          console.log('Token verification error:', err); 
          return res.sendStatus(403); 
      }
      req.user = user;
      next();
  });
};


router.get('/GetLoggedInUser', authenticateToken, async (req, res) => {
  try {
    
      const user = await Users.findById(req.user.id).select('group'); 
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      res.json({ success: true, result: { group: user.User_group } }); 
  } catch (error) {
      console.error('Error fetching user group:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params; 

  try {
      const user = await Users.findById(id);  

      if (!user) {
          return res.status(404).json({
              success: false,
              message: 'User not found',
          });
      }

      res.status(200).json({
          success: true,
          result: user,
      });
  } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({
          success: false,
          message: 'Error fetching user',
          error: error.message,
      });
  }
});

router.put('/update/:id', async (req, res) => {
const { id } = req.params;  
const { User_name, Mobile_number, User_group } = req.body;

try {
  const updatedUser = await Users.findOneAndUpdate(
    { _id: id }, 
    { User_name, Mobile_number, User_group },
    { new: true }  
  );

  if (!updatedUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    result: updatedUser,
  });
} catch (error) {
  console.error('Error updating user:', error);
  res.status(500).json({
    success: false,
    message: 'Error updating user',
    error: error.message,
  });
}
});

router.get('/getUserByName/:username', async (req, res) => {
  const { username } = req.params;

  try {
      const user = await Users.findOne({ User_name: username }); 

      if (!user) {
          return res.status(404).json({
              success: false,
              message: 'User not found',
          });
      }

      res.status(200).json({
          success: true,
          result: user,
      });
  } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({
          success: false,
          message: 'Error fetching user',
          error: error.message,
      });
  }
});

router.delete('/DeleteUser/:userUuid', async (req, res) => {
const { userUuid } = req.params;
try {
    const result = await Users.findOneAndDelete({ User_uuid: userUuid });
    if (!result) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
} catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
}
});


  module.exports = router;
