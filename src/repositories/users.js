const mongoose = require('mongoose');

const UsersSchema = new mongoose.Schema({
  User_uuid: { type: String },
  User_name: { type: String, required: true },
  Password: { type: String, required: true },
  Mobile_number: { type: String, required: true, unique: true },  // ✅ String and unique
  User_group: { type: String, required: true },
  Amount: { type: Number, required: true },
  AccountID: { type: String },

  Allowed_Task_Groups: {
    type: [String],
    default: [],
  }
});

// Indexes — only keep others
UsersSchema.index({ User_name: 1 });
UsersSchema.index({ User_group: 1 });
UsersSchema.index({ User_uuid: 1 });

const Users = mongoose.model("Users", UsersSchema);

module.exports = Users;
