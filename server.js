const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

// Body + cookies middleware (global)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());



//  Restricted CORS (only your frontend)
const restrictedCors = cors({
  origin: 'https://walletpay-ampersand.netlify.app',
  credentials: true
});

const publicCors = cors({
  origin: '*'
});

// Public payment route
app.use('/api/wallet/payment', publicCors, require('./routes/PaymentGatewayRoutes'));

//  Protected routes
app.use('/api/wallet', restrictedCors, require('./routes/walletRoutes'));
app.use('/api/wallet/notifications', restrictedCors, require('./routes/notificationRoutes'));
app.use('/api/wallet/card', restrictedCors, require('./routes/CardRoutes'));




app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});


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
