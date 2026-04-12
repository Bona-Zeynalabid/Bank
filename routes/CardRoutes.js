const express = require('express');
const router = express.Router();
const Card = require('../models/Card');
const User = require('../models/User');
const {requireAuth}= require("../middleware/authMiddleware");




// Generate Visa card number (16 digits starting with 4)
function generateCardNumber() {
  let number = '4';
  for (let i = 0; i < 14; i++) {
    number += Math.floor(Math.random() * 10);
  }
  const checkDigit = calculateLuhnCheckDigit(number);
  return number + checkDigit;
}

// Calculate Luhn check digit
function calculateLuhnCheckDigit(number) {
  const digits = number.split('').map(Number);
  let sum = 0;
  let shouldDouble = true;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits[i];
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  
  return ((10 - (sum % 10)) % 10).toString();
}

// Generate 4-digit CVV
function generateCVV() {
  return Math.floor(Math.random() * 9000 + 1000).toString();
}

// Generate expiry date (3 years from now)
function generateExpiry() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 3);
  return {
    month: (date.getMonth() + 1).toString().padStart(2, '0'),
    year: date.getFullYear().toString().slice(-2)
  };
}

// Reset daily spending if needed
async function resetDailySpending(card) {
  const today = new Date();
  const lastReset = new Date(card.lastResetDate);
  
  if (today.getDate() !== lastReset.getDate() || 
      today.getMonth() !== lastReset.getMonth() || 
      today.getFullYear() !== lastReset.getFullYear()) {
    card.spentToday = 0;
    card.lastResetDate = today;
    await card.save();
  }
}

// ============================================
// CREATE CARD
// POST /api/wallet/card/create
// ============================================
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { cardHolderName, dailyLimit = 5000 } = req.body;
    
   
    
    // Check if user already has a card
    const existingCard = await Card.findOne({ userId: req.userId });
    if (existingCard) {
      return res.status(400).json({ error: 'You already have a card. Delete it first to create new one.' });
    }
    
    // Generate card details
    const cardNumber = generateCardNumber();
    const cvv = generateCVV();
    const expiry = generateExpiry();
    
    // Create card
    const card = await Card.create({
      userId: req.userId,
      cardNumber,
      cvv,
      expiryMonth: expiry.month,
      expiryYear: expiry.year,
      cardHolderName: cardHolderName,
      dailyLimit,
      status: 'active'
    });
    
    // Mask card number for response
    const maskedNumber = '•••• •••• •••• ' + card.cardNumber.slice(-4);
    
    res.json({
      success: true,
      card: {
        id: card._id,
        cardNumber: maskedNumber,
        fullCardNumber: card.cardNumber,
        cvv: card.cvv,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cardHolderName: card.cardHolderName,
        status: card.status,
        dailyLimit: card.dailyLimit,
        spentToday: card.spentToday
      },
      wallet: {
        walletId: req.user.walletId,
        balance: req.user.balance
      }
    });
  } catch (error) {
    console.error('Create card error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET MY CARD
// GET /api/wallet/card/my-card
// ============================================
router.get('/my-card', requireAuth, async (req, res) => {
  try {
  
    
    const card = await Card.findOne({ userId: req.userId });
    
    if (!card) {
      return res.status(404).json({ error: 'No card found' });
    }
    
    // Reset daily spending if needed
    await resetDailySpending(card);
    
    // Mask card number
    const maskedNumber = '•••• •••• •••• ' + card.cardNumber.slice(-4);
    
    res.json({
      card: {
        id: card._id,
        cardNumber: maskedNumber,
        last4: card.cardNumber.slice(-4),
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cardHolderName: card.cardHolderName,
        status: card.status,
        dailyLimit: card.dailyLimit,
        spentToday: card.spentToday,
        remainingDailyLimit: card.dailyLimit - card.spentToday,
        createdAt: card.createdAt
      },
      wallet: {
        walletId: req.user.walletId,
        balance: req.user.balance
      }
    });
  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET FULL CARD DETAILS
// GET /api/wallet/card/card-details
// ============================================
router.get('/card-details', requireAuth, async (req, res) => {
  try {
    const card = await Card.findOne({ userId: req.userId });
    
    if (!card) {
      return res.status(404).json({ error: 'No card found' });
    }
    
    res.json({
      card: {
        cardNumber: card.cardNumber,
        cvv: card.cvv,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cardHolderName: card.cardHolderName
      }
    });
  } catch (error) {
    console.error('Get card details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TOGGLE CARD STATUS (active/frozen)
// PATCH /api/wallet/card/toggle-status
// ============================================
router.patch('/toggle-status', requireAuth, async (req, res) => {
  try {
    const card = await Card.findOne({ userId: req.userId });
    
    if (!card) {
      return res.status(404).json({ error: 'No card found' });
    }
    
    card.status = card.status === 'active' ? 'frozen' : 'active';
    await card.save();
    
    res.json({
      success: true,
      status: card.status,
      message: `Card is now ${card.status}`
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE CARD
// DELETE /api/wallet/card/delete
// ============================================
router.delete('/delete', requireAuth, async (req, res) => {
  try {
    const card = await Card.findOneAndDelete({ userId: req.userId });
    
    if (!card) {
      return res.status(404).json({ error: 'No card found' });
    }
    
    res.json({
      success: true,
      message: 'Card deleted successfully'
    });
  } catch (error) {
    console.error('Delete card error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;