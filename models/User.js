const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'transaction', 'send', 'receive'], // Added 'send' and 'receive'
    default: 'info'
  },
  read: {
    type: Boolean,
    default: false
  },
  fromWalletId: {
    type: String,
    default: ''
  },
  toWalletId: {
    type: String,
    default: ''
  },
  amount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    default: "",
    required: true
  },
  walletId: {
    type: String,
    default: uuidv4,
    unique: true
  },
  balance: {
    type: Number,
    default: 10000
  },
  notifications: [notificationSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.methods.comparePassword = function(candidatePassword) {
  return this.password === candidatePassword;
};


module.exports = mongoose.model('User', userSchema);
