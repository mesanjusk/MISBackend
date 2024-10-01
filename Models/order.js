const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
    Task: { type: String, required: true },
    Assigned: { type: String, required: true },
    Delivery_Date: { type: Date, required: true },
    Status_number: { type: Number, required: true },
    CreatedAt: { type: Date, required: true} 
  });

const OrdersSchema=new mongoose.Schema({
    Order_uuid: { type: String },
    Order_Number: { type: Number, required: true, unique: true },
    Customer_uuid: { type: String, required: true },   
    Priority: { type: String, required: true },
    Item: { type: String, required: true },
    Status: [statusSchema],
    Remark: { type: String, required: true },
    Rate: { type: Number, default: 0 }, 
    Quantity: { type: Number, default: 0 }, 
    Amount: { type: Number, default: 0 }, 
 },  { timestamps: true })

 const Orders = mongoose.model("Orders", OrdersSchema);

module.exports = Orders;