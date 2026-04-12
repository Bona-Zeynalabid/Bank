const User = require('../models/User');

// @desc    Get current user profile
// @route   GET /api/wallet/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        walletId: user.walletId,
        balance: user.balance,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get wallet balance
// @route   GET /api/wallet/balance
// @access  Private
const getBalance = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      data: {
        balance: user.balance,
        walletId: user.walletId
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMe,
  getBalance
};