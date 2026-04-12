const VirtualCard = require('../models/VirtualCard');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const CardGenerator = require('../utils/cardGenerator');
const mongoose = require('mongoose');

// @desc    Create new virtual card
// @route   POST /api/virtual-cards/create
// @access  Private
const createVirtualCard = async (req, res, next) => {
  try {
    const { cardHolderName, cardType = 'visa', spendingLimits } = req.body;
    
    // Check if user already has active card
    const existingCard = await VirtualCard.findOne({ 
      userId: req.user._id, 
      status: 'active' 
    });
    
    if (existingCard) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active virtual card'
      });
    }
    
    // Generate card details
    const cardNumber = CardGenerator.generateCardNumber(cardType);
    const cvv = CardGenerator.generateCVV();
    const expiry = CardGenerator.generateExpiry();
    
    // Create virtual card
    const virtualCard = await VirtualCard.create({
      userId: req.user._id,
      cardNumber,
      cardHolderName: cardHolderName || req.user.email.split('@')[0],
      expiryMonth: expiry.month,
      expiryYear: expiry.year,
      cvv,
      cardType,
      spendingLimit: spendingLimits || {
        daily: 1000,
        monthly: 5000,
        perTransaction: 500
      }
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: virtualCard._id,
        cardNumber: virtualCard.cardNumber,
        maskedNumber: CardGenerator.maskCardNumber(virtualCard.cardNumber),
        cardHolderName: virtualCard.cardHolderName,
        expiryMonth: virtualCard.expiryMonth,
        expiryYear: virtualCard.expiryYear,
        cvv: virtualCard.cvv,
        cardType: virtualCard.cardType,
        status: virtualCard.status,
        spendingLimit: virtualCard.spendingLimit,
        expiresAt: virtualCard.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's virtual cards
// @route   GET /api/virtual-cards
// @access  Private
const getVirtualCards = async (req, res, next) => {
  try {
    const cards = await VirtualCard.find({ userId: req.user._id })
      .sort('-createdAt');
    
    // Mask sensitive data
    const maskedCards = cards.map(card => ({
      id: card._id,
      maskedNumber: CardGenerator.maskCardNumber(card.cardNumber),
      cardHolderName: card.cardHolderName,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      cardType: card.cardType,
      status: card.status,
      spendingLimit: card.spendingLimit,
      spentToday: card.spentToday,
      spentThisMonth: card.spentThisMonth,
      createdAt: card.createdAt,
      expiresAt: card.expiresAt
    }));
    
    res.json({
      success: true,
      data: maskedCards
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Process payment with virtual card (Merchant endpoint)
// @route   POST /api/virtual-cards/process-payment
// @access  API Key (Merchant)
const processCardPayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { 
      cardNumber, 
      cardHolderName, 
      expiryMonth, 
      expiryYear, 
      cvv,
      amount,
      merchantId,
      description 
    } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount',
        code: 'INVALID_AMOUNT'
      });
    }
    
    // Find the virtual card
    const virtualCard = await VirtualCard.findOne({ 
      cardNumber,
      status: 'active'
    }).session(session);
    
    if (!virtualCard) {
      return res.status(400).json({
        success: false,
        message: 'Invalid card details',
        code: 'INVALID_CARD'
      });
    }
    
    // Validate card details
    if (virtualCard.cardHolderName !== cardHolderName ||
        virtualCard.expiryMonth !== expiryMonth ||
        virtualCard.expiryYear !== expiryYear ||
        virtualCard.cvv !== cvv) {
      return res.status(400).json({
        success: false,
        message: 'Card verification failed',
        code: 'CARD_MISMATCH'
      });
    }
    
    // Check if card is expired
    const expiryDate = new Date(`20${expiryYear}-${expiryMonth}-01`);
    if (expiryDate < new Date()) {
      virtualCard.status = 'expired';
      await virtualCard.save({ session });
      
      return res.status(400).json({
        success: false,
        message: 'Card has expired',
        code: 'CARD_EXPIRED'
      });
    }
    
    // Check spending limits
    const limitCheck = virtualCard.checkLimits(amount);
    if (!limitCheck.allowed) {
      return res.status(400).json({
        success: false,
        message: limitCheck.reason,
        code: 'LIMIT_EXCEEDED'
      });
    }
    
    // Get user (card holder)
    const user = await User.findById(virtualCard.userId).session(session);
    
    // Check wallet balance
    if (user.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient funds in wallet',
        code: 'INSUFFICIENT_FUNDS'
      });
    }
    
    // Get merchant (API key owner)
    const merchant = await User.findById(merchantId).session(session);
    
    if (!merchant) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Merchant not found',
        code: 'MERCHANT_NOT_FOUND'
      });
    }
    
    // Create transaction record
    const transaction = await Transaction.create([{
      sender: user._id,
      receiver: merchant._id,
      amount,
      description: `Virtual card payment: ${description || 'Purchase'}`,
      status: 'pending',
      paymentMethod: 'virtual_card',
      cardLast4: cardNumber.slice(-4)
    }], { session });
    
    // Update balances
    user.balance -= amount;
    merchant.balance += amount;
    
    await user.save({ session });
    await merchant.save({ session });
    
    // Update virtual card spending
    virtualCard.spentToday += amount;
    virtualCard.spentThisMonth += amount;
    virtualCard.lastUsedAt = new Date();
    await virtualCard.save({ session });
    
    // Update transaction status
    transaction[0].status = 'success';
    await transaction[0].save({ session });
    
    await session.commitTransaction();
    
    // Prepare response
    res.json({
      success: true,
      data: {
        approved: true,
        transactionId: transaction[0].transactionId,
        amount,
        authorizationCode: `AUTH${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
        cardLast4: cardNumber.slice(-4),
        newBalance: user.balance
      }
    });
    
  } catch (error) {
    await session.abortTransaction();
    
    // Return declined response
    res.status(400).json({
      success: false,
      message: 'Payment declined',
      code: 'DECLINED',
      approved: false
    });
  } finally {
    session.endSession();
  }
};

// @desc    Freeze/Unfreeze virtual card
// @route   PATCH /api/virtual-cards/:id/toggle-freeze
// @access  Private
const toggleFreezeCard = async (req, res, next) => {
  try {
    const card = await VirtualCard.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Card not found'
      });
    }
    
    card.status = card.status === 'frozen' ? 'active' : 'frozen';
    await card.save();
    
    res.json({
      success: true,
      data: {
        status: card.status,
        message: `Card ${card.status === 'frozen' ? 'frozen' : 'unfrozen'} successfully`
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete/Cancel virtual card
// @route   DELETE /api/virtual-cards/:id
// @access  Private
const cancelVirtualCard = async (req, res, next) => {
  try {
    const card = await VirtualCard.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Card not found'
      });
    }
    
    card.status = 'cancelled';
    await card.save();
    
    res.json({
      success: true,
      message: 'Virtual card cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get card details (with full number for viewing)
// @route   GET /api/virtual-cards/:id/details
// @access  Private
const getCardDetails = async (req, res, next) => {
  try {
    const card = await VirtualCard.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Card not found'
      });
    }
    
    // Return full details (sensitive)
    res.json({
      success: true,
      data: {
        cardNumber: card.cardNumber,
        cardHolderName: card.cardHolderName,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cvv: card.cvv,
        cardType: card.cardType,
        status: card.status,
        spendingLimit: card.spendingLimit,
        spentToday: card.spentToday,
        spentThisMonth: card.spentThisMonth
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVirtualCard,
  getVirtualCards,
  processCardPayment,
  toggleFreezeCard,
  cancelVirtualCard,
  getCardDetails
};