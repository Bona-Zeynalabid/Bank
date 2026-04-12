const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const ApiKey = require('../models/ApiKey');
const PaymentSession = require('../models/PaymentSession');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// ============================================
// AUTH MIDDLEWARE (Inline)
// ============================================
const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.wallet_user;
    
    if (!token) {
      return res.status(401).json({ error: 'Please login to continue' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      res.clearCookie('wallet_user');
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.clearCookie('wallet_user');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ============================================
// MERCHANT API KEY MANAGEMENT
// ============================================

// Create API Key
// Create API Key
router.post('/api-key/create', requireAuth, async (req, res) => {
  try {
    const { merchantName, callbackUrl } = req.body;
    
    if (!merchantName || !callbackUrl) {
      return res.status(400).json({ error: 'Merchant name and callback URL are required' });
    }
    
    // Check if user already has an API key
    const existingKey = await ApiKey.findOne({ userId: req.userId });
    if (existingKey) {
      return res.status(400).json({ error: 'You already have an API key' });
    }
    
    // Generate API key here (not in pre-save)
    const crypto = require('crypto');
    const generatedApiKey = 'pk_live_' + crypto.randomBytes(24).toString('hex');
    
    // Create API key with generated key
    const apiKey = await ApiKey.create({
      userId: req.userId,
      apiKey: generatedApiKey, // Explicitly set
      merchantName,
      callbackUrl,
      status: 'active'
    });
    
    res.json({
      success: true,
      apiKey: {
        id: apiKey._id,
        apiKey: apiKey.apiKey,
        merchantName: apiKey.merchantName,
        callbackUrl: apiKey.callbackUrl,
        status: apiKey.status,
        createdAt: apiKey.createdAt
      }
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: error.message });
  }
});
// Get my API Key
router.get('/api-key', requireAuth, async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({ userId: req.userId });
    
    if (!apiKey) {
      return res.json({
        success: true,
        apiKey: null
      });
    }
    
    res.json({
      success: true,
      apiKey: {
        id: apiKey._id,
        apiKey: apiKey.apiKey,
        merchantName: apiKey.merchantName,
        callbackUrl: apiKey.callbackUrl,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
        lastUsed: apiKey.lastUsed
      }
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle API Key status
router.patch('/api-key/toggle', requireAuth, async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({ userId: req.userId });
    
    if (!apiKey) {
      return res.status(404).json({ error: 'No API key found' });
    }
    
    apiKey.status = apiKey.status === 'active' ? 'inactive' : 'active';
    await apiKey.save();
    
    res.json({
      success: true,
      status: apiKey.status,
      message: `API key is now ${apiKey.status}`
    });
  } catch (error) {
    console.error('Toggle API key error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete API Key
router.delete('/api-key', requireAuth, async (req, res) => {
  try {
    const result = await ApiKey.findOneAndDelete({ userId: req.userId });
    
    if (!result) {
      return res.status(404).json({ error: 'No API key found' });
    }
    
    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get merchant payment sessions
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await PaymentSession.find({ merchantId: req.userId })
      .sort('-createdAt')
      .limit(50);
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        sessionId: s.sessionId,
        amount: s.amount,
        description: s.description,
        status: s.status,
        createdAt: s.createdAt
      }))
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUBLIC PAYMENT ENDPOINTS (No Auth Required)
// ============================================

// Create payment session
// Create payment session
router.post('/create-session', async (req, res) => {
  try {
    const { apiKey, amount, description } = req.body;
    
    // Validate API key
    const merchantKey = await ApiKey.findOne({ apiKey, status: 'active' });
    if (!merchantKey) {
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Update last used
    merchantKey.lastUsed = new Date();
    await merchantKey.save();
    
    // Generate session ID manually
    const crypto = require('crypto');
    const sessionId = 'pay_' + crypto.randomBytes(16).toString('hex');
    
    // Create payment session with explicit sessionId
    const session = await PaymentSession.create({
      sessionId: sessionId, // Explicitly set
      apiKeyId: merchantKey._id,
      merchantId: merchantKey.userId,
      amount: parseFloat(amount),
      description: description || `Payment to ${merchantKey.merchantName}`,
      status: 'pending'
    });
    
    // Return payment URL
    const paymentUrl = `http://localhost:5173/pay/${session.sessionId}`;
    
    res.json({
      success: true,
      sessionId: session.sessionId,
      paymentUrl,
      amount: session.amount,
      merchantName: merchantKey.merchantName
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get payment session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await PaymentSession.findOne({ sessionId: req.params.sessionId })
      .populate('apiKeyId');
    
    if (!session) {
      return res.status(404).json({ error: 'Payment session not found' });
    }
    
    res.json({
      sessionId: session.sessionId,
      amount: session.amount,
      description: session.description,
      merchantName: session.apiKeyId?.merchantName || 'Merchant',
      status: session.status
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process payment
// Process payment
// Process payment - Find payer by card number
router.post('/process/:sessionId', async (req, res) => {
  try {
    const { cardNumber, cardHolder, expiryMonth, expiryYear, cvv } = req.body;
    
    const session = await PaymentSession.findOne({ sessionId: req.params.sessionId })
      .populate('apiKeyId');
    
    if (!session) {
      return res.status(404).json({ error: 'Payment session not found' });
    }
    
    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed' });
    }
    
    // Validate card fields
    if (!cardNumber || !cardHolder || !expiryMonth || !expiryYear || !cvv) {
      return res.status(400).json({ error: 'All card fields are required' });
    }
    
    const cleanCardNumber = cardNumber.replace(/\s/g, '');
    
    // FIND PAYER BY CARD NUMBER
    const Card = require('../models/Card');
    const card = await Card.findOne({ 
      cardNumber: cleanCardNumber,
      cvv: cvv,
      expiryMonth: expiryMonth,
      expiryYear: expiryYear,
      status: 'active'
    });
    
    if (!card) {
      return res.status(400).json({ error: 'Invalid card details' });
    }
    
    // Get the user who owns this card
    const payer = await User.findById(card.userId);
    
    if (!payer) {
      return res.status(400).json({ error: 'Card holder account not found' });
    }
    
    // Check if payer has sufficient balance
    if (payer.balance < session.amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Save card details (only last 4 digits)
    session.cardDetails = {
      cardNumber: cleanCardNumber.slice(-4),
      cardHolder,
      expiryMonth,
      expiryYear,
      cvv: '***'
    };
    session.status = 'processing';
    await session.save();
    
    // Simulate payment (95% success rate)
    const isSuccess = Math.random() > 0.05;
    
    if (isSuccess) {
      // Get merchant
      const merchant = await User.findById(session.merchantId);
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      // DEDUCT from payer
      payer.balance -= session.amount;
      await payer.save();
      
      // ADD to merchant
      merchant.balance += session.amount;
      await merchant.save();
      
      // Update card spending
      const today = new Date();
      const lastReset = new Date(card.lastResetDate);
      
      if (today.getDate() !== lastReset.getDate() || 
          today.getMonth() !== lastReset.getMonth() || 
          today.getFullYear() !== lastReset.getFullYear()) {
        card.spentToday = 0;
        card.lastResetDate = today;
      }
      
      card.spentToday += session.amount;
      await card.save();
      
      // Create transaction record
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        from: payer.walletId,
        to: merchant.walletId,
        amount: session.amount,
        description: `Card payment to ${merchant.name}: ${session.description}`,
        date: new Date()
      });
      
      // Send notifications
      const { sendNotification } = require('./notificationRoutes');
      await sendNotification(
        payer.walletId,
        'Payment Sent',
        `You paid ETB${session.amount} to ${merchant.name} using your card ending in ${cleanCardNumber.slice(-4)}`,
        'send',
        { toWalletId: merchant.walletId, amount: session.amount }
      );
      
      await sendNotification(
        merchant.walletId,
        'Payment Received',
        `You received ETB${session.amount} from card ending in ${cleanCardNumber.slice(-4)}`,
        'receive',
        { amount: session.amount }
      );
      
      session.status = 'success';
      session.completedAt = new Date();
      await session.save();
      
      const callbackUrl = `${session.apiKeyId.callbackUrl}?session_id=${session.sessionId}&status=success`;
      
      res.json({
        success: true,
        message: 'Payment successful',
        redirectUrl: callbackUrl,
        sessionId: session.sessionId
      });
    } else {
      session.status = 'failed';
      session.completedAt = new Date();
      await session.save();
      
      const callbackUrl = `${session.apiKeyId.callbackUrl}?session_id=${session.sessionId}&status=failed`;
      
      res.status(400).json({
        success: false,
        error: 'Payment declined',
        redirectUrl: callbackUrl
      });
    }
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;