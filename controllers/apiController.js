const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

// @desc    Generate API key for user
// @route   POST /api/api-key/generate
// @access  Private
const generateApiKey = async (req, res, next) => {
  try {
    // Check if API key already exists
    let apiKey = await ApiKey.findOne({ userId: req.user._id });

    if (apiKey) {
      // Regenerate new key
      const { v4: uuidv4 } = require('uuid');
      apiKey.apiKey = uuidv4();
      apiKey.isActive = true;
      await apiKey.save();
    } else {
      // Create new API key
      apiKey = await ApiKey.create({
        userId: req.user._id
      });
    }

    res.json({
      success: true,
      data: {
        apiKey: apiKey.apiKey,
        createdAt: apiKey.createdAt,
        message: 'Keep this key secure. Do not share it publicly.'
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Validate API key middleware
const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required'
      });
    }

    const keyDoc = await ApiKey.findOne({ apiKey, isActive: true });

    if (!keyDoc) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive API key'
      });
    }

    // Update last used and request count
    keyDoc.lastUsed = new Date();
    keyDoc.requestCount += 1;
    await keyDoc.save();

    // Attach user to request
    req.user = await User.findById(keyDoc.userId);
    req.apiKey = keyDoc;

    next();
  } catch (error) {
    next(error);
  }
};

// @desc    Create payment request (external)
// @route   POST /api/external/create-payment
// @access  API Key
const createPayment = async (req, res, next) => {
  try {
    const { amount, callbackUrl, description } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Create payment request record
    const paymentRequest = {
      requestId: `PAY${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
      amount,
      walletId: req.user.walletId,
      callbackUrl,
      description,
      status: 'pending',
      createdAt: new Date()
    };

    // In production, store this in a database
    // For now, we'll just return the payment details

    res.json({
      success: true,
      data: {
        paymentRequest,
        paymentUrl: `http://localhost:${process.env.PORT}/payment/${paymentRequest.requestId}`,
        expiresIn: '30 minutes'
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Execute payment (external)
// @route   POST /api/external/execute-payment
// @access  API Key
const executePayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, fromWalletId } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Get sender (the one paying)
    const sender = await User.findOne({ walletId: fromWalletId }).session(session);
    
    if (!sender) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Sender wallet not found'
      });
    }

    // Check if sender has sufficient balance
    if (sender.balance < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Get receiver (the API key owner)
    const receiver = await User.findById(req.user._id).session(session);

    // Create transaction
    const transaction = await Transaction.create([{
      sender: sender._id,
      receiver: receiver._id,
      amount,
      description: `External payment via API`,
      status: 'pending'
    }], { session });

    // Update balances
    sender.balance -= amount;
    receiver.balance += amount;

    await sender.save({ session });
    await receiver.save({ session });

    // Update transaction status
    transaction[0].status = 'success';
    await transaction[0].save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        transactionId: transaction[0].transactionId,
        amount,
        status: 'success',
        timestamp: transaction[0].createdAt
      }
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

module.exports = {
  generateApiKey,
  validateApiKey,
  createPayment,
  executePayment
};