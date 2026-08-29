/**
 * Webhook handler for Razorpay payment.failed events.
 *
 * Flow:
 *  1. Verify webhook signature (skipped for simulated events)
 *  2. Extract error fields from the payment entity
 *  3. Classify into root-cause bucket
 *  4. Execute appropriate recovery action
 *  5. Persist full audit trail to SQLite
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { classifyFailure } = require('./classifier');
const { executeAction } = require('./actions');
const { insertEvent } = require('./database');

const router = express.Router();

/**
 * Verify Razorpay webhook signature.
 * Returns true if valid, false otherwise.
 */
function verifySignature(body, signature, secret) {
  if (!secret || !signature) return false;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

/**
 * Mount the webhook route.
 * @param {Object} razorpay - Razorpay SDK instance (or null)
 * @param {string} webhookSecret - Webhook secret for signature verification
 */
function createWebhookRouter(razorpay, webhookSecret) {
  // We need the raw body for signature verification
  router.post(
    '/',
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
    async (req, res) => {
      try {
        const isSimulated = req.headers['x-simulated-event'] === 'true';

        // ── Step 1: Signature verification ──────────────────────────────
        if (!isSimulated && webhookSecret) {
          const signature = req.headers['x-razorpay-signature'];
          if (!verifySignature(req.rawBody, signature, webhookSecret)) {
            console.log('❌ Webhook signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
          }
        }

        const body = req.body;

        // Only process payment.failed events
        if (body.event !== 'payment.failed') {
          return res.status(200).json({ status: 'ignored', event: body.event });
        }

        // ── Step 2: Extract payment and error data ──────────────────────
        const payment = body.payload?.payment?.entity || {};
        const errorData = {
          error_code: payment.error_code || body.error_code || '',
          error_source: payment.error_source || body.error_source || '',
          error_reason: payment.error_reason || body.error_reason || '',
          error_step: payment.error_step || body.error_step || '',
          error_description: payment.error_description || body.error_description || '',
        };

        const paymentData = {
          payment_id: payment.id || body.payment_id || `pay_unknown_${uuidv4().slice(0, 8)}`,
          order_id: payment.order_id || body.order_id || null,
          amount: payment.amount || body.amount || 0,
          currency: payment.currency || body.currency || 'INR',
          method: payment.method || body.method || 'unknown',
          contact: payment.contact || body.contact || '',
          email: payment.email || body.email || '',
        };

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📥 Payment Failed: ${paymentData.payment_id}`);
        console.log(`   Amount: ₹${(paymentData.amount / 100).toFixed(2)} | Method: ${paymentData.method}`);
        console.log(`   Error:  [${errorData.error_code}] ${errorData.error_reason} — ${errorData.error_description}`);

        // ── Step 3: Classify ────────────────────────────────────────────
        const { bucket, matchedRule } = classifyFailure(errorData);
        console.log(`   🏷️  Bucket: ${bucket} (rule: ${matchedRule})`);

        // ── Step 4: Execute recovery action ─────────────────────────────
        const actionResult = await executeAction(bucket, paymentData, razorpay);
        console.log(`   🎯 Action: ${actionResult.action_taken} → Outcome: ${actionResult.outcome}`);

        // ── Step 5: Persist to audit log ────────────────────────────────
        const eventRecord = {
          id: uuidv4(),
          payment_id: paymentData.payment_id,
          order_id: paymentData.order_id,
          amount: paymentData.amount,
          currency: paymentData.currency,
          method: paymentData.method,
          contact: paymentData.contact,
          email: paymentData.email,
          error_code: errorData.error_code,
          error_source: errorData.error_source,
          error_reason: errorData.error_reason,
          error_step: errorData.error_step,
          error_description: errorData.error_description,
          bucket,
          matched_rule: matchedRule,
          action_taken: actionResult.action_taken,
          action_detail: actionResult.action_detail,
          outcome: actionResult.outcome,
          failed_at: payment.created_at
            ? new Date(payment.created_at * 1000).toISOString()
            : new Date().toISOString(),
          actioned_at: actionResult.actioned_at,
          resolved_at: actionResult.resolved_at,
        };

        insertEvent(eventRecord);
        console.log(`   💾 Saved to audit log (id: ${eventRecord.id})`);
        console.log(`${'═'.repeat(60)}\n`);

        return res.status(200).json({
          status: 'processed',
          id: eventRecord.id,
          bucket,
          action: actionResult.action_taken,
          outcome: actionResult.outcome,
        });
      } catch (err) {
        console.error('❌ Webhook processing error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

module.exports = { createWebhookRouter };
