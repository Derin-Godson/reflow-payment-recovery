const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'audit.db');

let db;

/**
 * Initialise the SQLite database and create the schema if it doesn't exist.
 */
function initDatabase() {
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_events (
      id                TEXT PRIMARY KEY,
      payment_id        TEXT NOT NULL,
      order_id          TEXT,
      amount            INTEGER,
      currency          TEXT DEFAULT 'INR',
      method            TEXT,
      contact           TEXT,
      email             TEXT,
      error_code        TEXT,
      error_source      TEXT,
      error_reason      TEXT,
      error_step        TEXT,
      error_description TEXT,
      -- Classification
      bucket            TEXT NOT NULL,
      matched_rule      TEXT,
      reflow_action     TEXT,
reflow_score      REAL,
guardrail_applied INTEGER DEFAULT 0,
guardrail_reason  TEXT,
      -- Action
      action_taken      TEXT,
      action_detail     TEXT,
      outcome           TEXT,
      -- Timestamps
      failed_at         TEXT,
      actioned_at       TEXT,
      resolved_at       TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bucket ON payment_events(bucket);
    CREATE INDEX IF NOT EXISTS idx_outcome ON payment_events(outcome);
    CREATE INDEX IF NOT EXISTS idx_payment_id ON payment_events(payment_id);
  `);

  return db;
}

/**
 * Insert a fully-classified payment event into the audit log.
 */
function insertEvent(event) {
  const stmt = db.prepare(`
    INSERT INTO payment_events (
      id, payment_id, order_id, amount, currency, method, contact, email,
      error_code, error_source, error_reason, error_step, error_description,
      bucket, matched_rule,
reflow_action, reflow_score, guardrail_applied, guardrail_reason,
action_taken, action_detail, outcome,
      failed_at, actioned_at, resolved_at
    ) VALUES (
      @id, @payment_id, @order_id, @amount, @currency, @method, @contact, @email,
      @error_code, @error_source, @error_reason, @error_step, @error_description,
      @bucket, @matched_rule,
@reflow_action, @reflow_score, @guardrail_applied, @guardrail_reason,
@action_taken, @action_detail, @outcome,
      @failed_at, @actioned_at, @resolved_at
    )
  `);
  return stmt.run(event);
}

/**
 * Update the outcome of an existing event (e.g., when a retry succeeds).
 */
function updateOutcome(id, outcome, resolvedAt) {
  const stmt = db.prepare(`
    UPDATE payment_events
    SET outcome = @outcome, resolved_at = @resolvedAt
    WHERE id = @id
  `);
  return stmt.run({ id, outcome, resolvedAt });
}

/**
 * Get all events, newest first.
 */
function getAllEvents(limit = 200) {
  return db.prepare(`
    SELECT * FROM payment_events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Dashboard summary: counts per bucket and recovery stats.
 */
function getDashboardStats() {
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM payment_events').get();
  const total = totalRow.total;

  const bucketBreakdown = db.prepare(`
    SELECT bucket, COUNT(*) as count
    FROM payment_events
    GROUP BY bucket
    ORDER BY count DESC
  `).all();

  const outcomeBreakdown = db.prepare(`
    SELECT outcome, COUNT(*) as count
    FROM payment_events
    GROUP BY outcome
    ORDER BY count DESC
  `).all();

  const recoveredRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM payment_events
    WHERE outcome = 'recovered'
  `).get();

  const actionableRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM payment_events
    WHERE action_taken != 'manual_review'
  `).get();

  const bucketRecovery = db.prepare(`
    SELECT
      bucket,
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'recovered' THEN 1 ELSE 0 END) as recovered
    FROM payment_events
    GROUP BY bucket
  `).all();

  return {
    total,
    recovered: recoveredRow.count,
    recoveryRate: total > 0 ? ((recoveredRow.count / total) * 100).toFixed(1) : 0,
    actionable: actionableRow.count,
    bucketBreakdown,
    outcomeBreakdown,
    bucketRecovery,
  };
}

/**
 * Clear all data (useful for re-running simulations).
 */
function clearAll() {
  db.prepare('DELETE FROM payment_events').run();
}

function getDb() {
  return db;
}

module.exports = {
  initDatabase,
  insertEvent,
  updateOutcome,
  getAllEvents,
  getDashboardStats,
  clearAll,
  getDb,
};
