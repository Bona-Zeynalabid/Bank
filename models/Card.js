const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true  // One card per user
  },
  cardNumber: {
    type: String,
    required: true,
    unique: true
  },
  cvv: {  // Changed from csc to cvv, 4 digits
    type: String,
    required: true
  },
  expiryMonth: {
    type: String,
    required: true
  },
  expiryYear: {
    type: String,
    required: true
  },
  cardHolderName: {
    type: String,
    required: true
  },
  cardType: {
    type: String,
    enum: ['visa', 'mastercard', 'amex'],
    default: 'visa'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'frozen'],
    default: 'active'
  },
  dailyLimit: {
    type: Number,
    default: 5000
  },
  spentToday: {
    type: Number,
    default: 0
  },
  lastResetDate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Card', cardSchema);