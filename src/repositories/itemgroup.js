const mongoose = require('mongoose');

const ItemgroupSchema=new mongoose.Schema({
    Item_group_uuid: { type: String },
    Item_group: { type: String, required: true },
 })

// Index for faster lookup of item groups
ItemgroupSchema.index({ Item_group: 1 });
ItemgroupSchema.index({ Item_group_uuid: 1 });

 const  Itemgroup = mongoose.model(" Itemgroup",  ItemgroupSchema);

module.exports =  Itemgroup;
