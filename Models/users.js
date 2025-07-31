const mongoose = require('mongoose');

const UsersSchema = new mongoose.Schema({
  User_uuid: { type: String },
  User_name: { type: String, required: true },
  Password: { type: String, required: true },
  Mobile_number: { type: Number, required: true, unique: true },
  User_group: { type: String, required: true },
  Amount: { type: Number, required: true },
  AccountID: { type: String },

  // ✅ NEW FIELD
  Allowed_Task_Groups: {
    type: [String], // Array of task group names like ["Printing", "Binding"]
    default: [],
  }
});

// Index definitions to help user lookups and population
UsersSchema.index({ User_name: 1 });
UsersSchema.index({ Mobile_number: 1 });
UsersSchema.index({ User_group: 1 });
UsersSchema.index({ User_uuid: 1 });

const Users = mongoose.model("Users", UsersSchema);

module.exports = Users;
