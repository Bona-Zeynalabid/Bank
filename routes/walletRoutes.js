const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
//const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const { sendNotification } = require("./notificationRoutes");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Middleware to get current user from cookie
const getCurrentUser = async (req, res, next) => {
  try {
    const token = req.cookies?.wallet_user;

    if (!token) {
      return res.status(401).json({ error: "Not logged in" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    

    // Find user by ID
    const user = await User.findById(decoded.id);

    if (!user) {
      res.clearCookie("wallet_user");
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.clearCookie("wallet_user");
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ============ AUTH ROUTES ============

// Register route

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

  

    // Check if user exists
    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      // Generate a random secure password for Google users
      const randomPassword = crypto.randomBytes(32).toString("hex");

      // Create new user
      user = await User.create({
        name,
        email,
        password: randomPassword, // Random password they'll never use
      });

      isNewUser = true;
     
    } else {
      
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, walletId: user.walletId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Set cookie
    res.cookie("wallet_user", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: false,
      sameSite: "lax",
    });

    // Send welcome notification only for new users
    if (isNewUser) {
      await sendNotification(
        user.walletId,
        "🎉 Welcome to WalletPay!",
        `Hi ${name}, thanks for joining! You've received 10,000 ETB as a welcome bonus. Explore virtual cards, API payments, and instant transfers. Never share your card details or API keys with anyone.`,
        "success"
      );
    }

    res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        walletId: user.walletId,
        balance: user.balance,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Failed to authenticate with Google" });
  }
});


// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user._id, walletId: user.walletId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Set cookie
    res.cookie("wallet_user", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: false,
      sameSite: "lax",
    });

    return res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        walletId: user.walletId,
        balance: user.balance,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Logout route
router.post("/logout", (req, res) => {
  res.clearCookie("wallet_user");
  return res.json({ success: true, message: "Logged out successfully" });
});

// ============ PROTECTED ROUTES ============

// Get current user profile
router.get("/me", getCurrentUser, async (req, res) => {
  try {
    return res.json({
      name: req.user.name,
      email: req.user.email,
      walletId: req.user.walletId,
      balance: req.user.balance,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Get my balance
router.get("/my-balance", getCurrentUser, async (req, res) => {
  try {
    return res.json({
      walletId: req.user.walletId,
      balance: req.user.balance,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Get my transactions
router.get("/my-transactions", getCurrentUser, async (req, res) => {
  try {
    const walletId = req.user.walletId;

    const transactions = await Transaction.find({
      $or: [{ from: walletId }, { to: walletId }],
    }).sort("-date");

    const formatted = await Promise.all(
      transactions.map(async (tx) => {
        const isSender = tx.from === walletId;
        const otherPartyId = isSender ? tx.to : tx.from;

        const otherParty = await User.findOne({ walletId: otherPartyId });

        return {
          id: tx._id,
          type: isSender ? "send" : "receive",
          amount: tx.amount,
          user: otherParty ? otherParty.name : otherPartyId,
          description: tx.description,
          status: "success",
          date: new Date(tx.date).toLocaleDateString(),
          time: new Date(tx.date).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          createdAt: tx.date,
        };
      }),
    );

    return res.json({
      walletId,
      totalTransactions: transactions.length,
      transactions: formatted,
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Send money
router.post("/send", getCurrentUser, async (req, res) => {
  try {
    const { toWalletId, amount, description } = req.body;
    const fromWalletId = req.user.walletId;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Amount must be positive" });
    }

    // Check if same wallet
    if (fromWalletId === toWalletId) {
      return res.status(400).json({ error: "Cannot send to same wallet" });
    }

    // Find sender
    const sender = await User.findOne({ walletId: fromWalletId });
    if (!sender) {
      return res.status(404).json({ error: "Sender not found" });
    }

    // Find receiver
    const receiver = await User.findOne({ walletId: toWalletId });
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    // Check balance
    if (sender.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Transfer money
    sender.balance -= parseFloat(amount);
    receiver.balance += parseFloat(amount);

    // Save both users
    await sender.save();
    await receiver.save();

    // Create transaction record
    await Transaction.create({
      from: fromWalletId,
      to: toWalletId,
      amount: parseFloat(amount),
      description: description || "Money transfer",
      date: new Date(),
    });

    // Import sendNotification
    const { sendNotification } = require('./notificationRoutes');

    // Notify sender
    await sendNotification(
      fromWalletId,
      "Money Sent",
      `You sent ETB${amount} to ${receiver.name}`,
      "transaction",
      {
        toWalletId: toWalletId,
        amount: amount
      }
    );

    // Notify receiver
    await sendNotification(
      toWalletId,
      "Money Received",
      `You received ETB${amount} from ${sender.name}`,
      "transaction",
      {
        fromWalletId: fromWalletId,
        amount: amount
      }
    );

    // IMPORTANT: Return success response
    return res.status(200).json({
      success: true,
      message: `Sent ETB${amount} successfully`,
      sender: {
        walletId: sender.walletId,
        newBalance: sender.balance,
      },
      receiver: {
        walletId: receiver.walletId,
        name: receiver.name,
      },
    });
  } catch (error) {
    console.error("Send money error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Add money
router.post("/add-money", getCurrentUser, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Amount must be positive" });
    }

    const user = req.user;
    user.balance += parseFloat(amount);
    await user.save();

    return res.json({
      success: true,
      message: `Added $${amount} to wallet`,
      newBalance: user.balance,
    });
  } catch (error) {
    console.error("Add money error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ============ PUBLIC ROUTES ============

// Get all users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find()
      .select("name email walletId balance createdAt")
      .sort("-createdAt");
    return res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Get user by wallet ID
router.get("/user/:walletId", async (req, res) => {
  try {
    const user = await User.findOne({ walletId: req.params.walletId }).select(
      "name email walletId balance",
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Check any wallet balance
router.get("/balance/:walletId", async (req, res) => {
  try {
    const user = await User.findOne({ walletId: req.params.walletId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      walletId: user.walletId,
      balance: user.balance,
    });
  } catch (error) {
    console.error("Get balance error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// View any wallet transactions
router.get("/transactions/:walletId", async (req, res) => {
  try {
    const { walletId } = req.params;

    const transactions = await Transaction.find({
      $or: [{ from: walletId }, { to: walletId }],
    }).sort("-date");

    const formatted = await Promise.all(
      transactions.map(async (tx) => {
        const isSender = tx.from === walletId;
        const otherPartyId = isSender ? tx.to : tx.from;
        const otherParty = await User.findOne({ walletId: otherPartyId });

        return {
          id: tx._id,
          type: isSender ? "send" : "receive",
          amount: tx.amount,
          user: otherParty ? otherParty.name : otherPartyId,
          description: tx.description,
          date: tx.date,
        };
      }),
    );

    return res.json({
      walletId,
      totalTransactions: transactions.length,
      transactions: formatted,
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN ROUTES ============

// Delete user account
router.delete("/user/:walletId", async (req, res) => {
  try {
    const user = await User.findOneAndDelete({ walletId: req.params.walletId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await Transaction.deleteMany({
      $or: [{ from: req.params.walletId }, { to: req.params.walletId }],
    });

    return res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
