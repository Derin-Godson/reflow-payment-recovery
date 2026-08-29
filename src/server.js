/**
 * Express server — entry point for the Payment Failure Retry Agent.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const Razorpay = require('razorpay');
const { initDatabase } = require('./database');
const { createWebhookRouter } = require('./webhook');
const dashboardRoutes = require('./dashboard');

const PORT = process.env.PORT || 3000;

// ── Initialise database ────────────────────────────────────────────────────
console.log('📦 Initialising SQLite database...');
initDatabase();
console.log('✅ Database ready.\n');

// ── Initialise Razorpay SDK (if keys present) ──────────────────────────────
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  console.log(`🔑 Razorpay SDK initialised (key: ${process.env.RAZORPAY_KEY_ID.slice(0, 12)}...)`);
} else {
  console.log('⚠️  No Razorpay API keys found — running in simulation-only mode.');
  console.log('   To use real API calls, copy .env.example to .env and add your keys.\n');
}

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', dashboardRoutes);

// Webhook route (handles its own body parsing for signature verification)
app.use(
  '/webhook/razorpay',
  createWebhookRouter(razorpay, process.env.RAZORPAY_WEBHOOK_SECRET || '')
);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Payment Failure Retry Agent running on http://localhost:${PORT}`);
  console.log(`   📊 Dashboard:  http://localhost:${PORT}`);
  console.log(`   🔗 Webhook:    http://localhost:${PORT}/webhook/razorpay`);
  console.log(`   📡 API:        http://localhost:${PORT}/api/dashboard`);
  console.log(`\n   Run the simulator:  npm run simulate\n`);
});

module.exports = app;
