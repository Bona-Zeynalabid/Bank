const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.wallet_user; // Changed from 'token' to 'wallet_user'

    if (!token) {
      return res.status(401).json({ error: 'Please login to continue' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user
    const user = await User.findById(decoded.id);

    if (!user) {
      res.clearCookie('wallet_user'); // Changed from 'token' to 'wallet_user'
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.userId = user._id; // Add userId for card routes
    next();

  } catch (error) {
    res.clearCookie('wallet_user'); // Changed from 'token' to 'wallet_user'
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { requireAuth };