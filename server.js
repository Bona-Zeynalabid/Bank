const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

// Middleware for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Public payment routes - accessible from anywhere
app.use('/api/wallet/payment', cors(), require('./routes/PaymentGatewayRoutes'));

// Protected routes - only your frontend
app.use('/api/wallet', cors({
  origin: 'https://walletpay-ampersand.netlify.app',
  credentials: true
}), require('./routes/walletRoutes'));

app.use('/api/wallet/notifications', cors({
  origin: 'https://walletpay-ampersand.netlify.app',
  credentials: true
}), require('./routes/notificationRoutes'));

app.use('/api/wallet/card', cors({
  origin: 'https://walletpay-ampersand.netlify.app',
  credentials: true
}), require('./routes/CardRoutes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  res.status(500).json({ 
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
