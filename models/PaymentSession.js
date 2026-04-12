const mongoose = require('mongoose');

const paymentSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  apiKeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApiKey',
    required: true
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'success', 'failed'],
    default: 'pending'
  },
  cardDetails: {
    cardNumber: String,
    cardHolder: String,
    expiryMonth: String,
    expiryYear: String,
    cvv: String
  },
  paymentMethod: {
    type: String,
    default: 'card'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

// NO pre-save hook - generate sessionId in the route

module.exports = mongoose.model('PaymentSession', paymentSessionSchema);