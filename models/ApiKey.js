const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  apiKey: {
    type: String,
    required: true,
    unique: true
  },
  merchantName: {
    type: String,
    required: true
  },
  businessInfo: {
    type: String,
    default: ''
  },
  callbackUrl: {
    type: String,
    required: true
  },
  webhookUrl: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'frozen'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date
  }
});

// NO pre-save hook - we'll generate in the route

module.exports = mongoose.model('ApiKey', apiKeySchema);