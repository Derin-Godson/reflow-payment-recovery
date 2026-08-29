/**
 * Dashboard API routes — serves stats and audit log data to the frontend.
 */

const express = require('express');
const { getDashboardStats, getAllEvents, clearAll } = require('./database');

const router = express.Router();

/**
 * GET /api/dashboard — summary statistics for the dashboard.
 */
router.get('/dashboard', (_req, res) => {
  try {
    const stats = getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

/**
 * GET /api/events — paginated list of all audit log entries.
 */
router.get('/events', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const events = getAllEvents(limit);
    res.json(events);
  } catch (err) {
    console.error('Events fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * POST /api/reset — clear all data (for re-running simulations).
 */
router.post('/reset', (_req, res) => {
  try {
    clearAll();
    console.log('🗑️  All audit data cleared.');
    res.json({ status: 'cleared' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

module.exports = router;
