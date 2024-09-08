const mongoose = require('mongoose');

const ItemsSchema=new mongoose.Schema({
    Item_uuid: { type: String },
    Item_name: { type: String, required: true },
    Item_group: { type: String, required: true },
 })

 const Items = mongoose.model("Items", ItemsSchema);

module.exports = Items;