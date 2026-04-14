const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');


dotenv.config();
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: 'https://walletpay-ampersand.netlify.app',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware


// Routes
app.use('/api/wallet', require('./routes/walletRoutes'));
// Add this with other route imports
app.use('/api/wallet/notifications', require('./routes/notificationRoutes'));
app.use('/api/wallet/card', require('./routes/CardRoutes'));
// Add payment gateway routes
app.use('/api/wallet/payment', require('./routes/PaymentGatewayRoutes'));

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
