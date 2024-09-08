const mongoose = require('mongoose');

const TasksSchema=new mongoose.Schema({
    Task_uuid: { type: String },
    Task_name: { type: String, required: true },
    Task_group: { type: String, required: true },
 })

 const Tasks = mongoose.model("Tasks", TasksSchema);

module.exports = Tasks;