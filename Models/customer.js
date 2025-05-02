const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true, // Ensures no duplicate names
    trim: true
  },
  mobile: {
    type: String,
    validate: {
      validator: function (v) {
        return !v || /^\d{10}$/.test(v); // optional but must be 10-digit if provided
      },
      message: props => `${props.value} is not a valid 10-digit mobile number!`
    }
  },
  group: String,
  status: {
    type: String,
    default: "Active"
  },
  lastInteraction: Date,
  tags: [String]
});

module.exports = mongoose.model('Customer', customerSchema);
