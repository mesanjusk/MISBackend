const mongoose = require('mongoose');

const ItemgroupSchema=new mongoose.Schema({
    Item_group_uuid: { type: String },
    Item_group: { type: String, required: true },
 })

 const  Itemgroup = mongoose.model(" Itemgroup",  ItemgroupSchema);

module.exports =  Itemgroup;