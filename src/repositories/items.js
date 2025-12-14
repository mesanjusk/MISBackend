const mongoose = require('mongoose');

const ItemsSchema=new mongoose.Schema({
    Item_uuid: { type: String },
    Item_name: { type: String, required: true },
    Item_group: { type: String, required: true },
 })

// Indexes for item search and sorting
ItemsSchema.index({ Item_name: 1 });
ItemsSchema.index({ Item_group: 1 });
ItemsSchema.index({ Item_uuid: 1 });

 const Items = mongoose.model("Items", ItemsSchema);

module.exports = Items;
