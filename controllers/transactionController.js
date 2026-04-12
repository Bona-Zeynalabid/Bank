const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

// @desc    Send money to another wallet
// @route   POST /api/transactions/send
// @access  Private
const sendMoney = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { receiverWalletId, amount, description } = req.body;

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Get sender
    const sender = await User.findById(req.user._id).session(session);
    
    // Check if sender has sufficient balance
    if (sender.balance < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Get receiver
    const receiver = await User.findOne({ walletId: receiverWalletId }).session(session);
    
    if (!receiver) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Receiver wallet not found'
      });
    }

    // Check if sender and receiver are same
    if (sender.walletId === receiverWalletId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Cannot send money to yourself'
      });
    }

    // Create transaction record
    const transaction = await Transaction.create([{
      sender: sender._id,
      receiver: receiver._id,
      amount,
      description,
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

    // Check for large transaction (fraud alert)
    const isLargeTransaction = amount >= 1000;
    const message = isLargeTransaction 
      ? `Large transaction of $${amount} detected and flagged for review`
      : undefined;

    res.json({
      success: true,
      data: {
        transactionId: transaction[0].transactionId,
        amount,
        receiver: receiver.email,
        status: 'success',
        newBalance: sender.balance,
        message
      }
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// @desc    Get transaction history
// @route   GET /api/transactions/history
// @access  Private
const getTransactionHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({
      $or: [
        { sender: req.user._id },
        { receiver: req.user._id }
      ]
    })
    .populate('sender', 'email walletId')
    .populate('receiver', 'email walletId')
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

    const total = await Transaction.countDocuments({
      $or: [
        { sender: req.user._id },
        { receiver: req.user._id }
      ]
    });

    // Format transactions for response
    const formattedTransactions = transactions.map(tx => {
      const isSender = tx.sender._id.toString() === req.user._id.toString();
      return {
        transactionId: tx.transactionId,
        type: isSender ? 'sent' : 'received',
        amount: tx.amount,
        counterparty: isSender ? tx.receiver.email : tx.sender.email,
        status: tx.status,
        description: tx.description,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt
      };
    });

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMoney,
  getTransactionHistory
};