const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require("../middleware/authMiddleware");

// Get all notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const notifications = user.notifications.sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({
      success: true,
      notifications,
      unreadCount: user.notifications.filter(n => !n.read).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread count only (for badge)
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const unreadCount = user.notifications.filter(n => !n.read).length;
    
    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark as read
router.patch('/:notificationId/read', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const notification = user.notifications.id(req.params.notificationId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    notification.read = true;
    await user.save();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all as read
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.notifications.forEach(n => n.read = true);
    await user.save();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/:notificationId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.notifications = user.notifications.filter(
      n => n._id.toString() !== req.params.notificationId
    );
    await user.save();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to send notification
// Helper function to send notification
const sendNotification = async (walletId, title, message, type = 'info', extraData = {}) => {
  try {
    const user = await User.findOne({ walletId });
    if (user) {
      user.notifications.push({ 
        title, 
        message, 
        type,
        ...extraData // Include extra data like fromWalletId, toWalletId, amount, etc.
      });
      await user.save();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Send notification error:', error);
    return false;
  }
};

router.sendNotification = sendNotification;
module.exports = router;