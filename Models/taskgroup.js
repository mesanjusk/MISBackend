const mongoose = require('mongoose');

const TaskgroupSchema=new mongoose.Schema({
    Task_group_uuid: { type: String },
    Task_group: { type: String, required: true },
    Id: { type: Number, required: true }
 })

 const  Taskgroup = mongoose.model(" Taskgroup",  TaskgroupSchema);

module.exports =  Taskgroup;
