const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { classifyFailure } = require('./classifier');
const { executeAction } = require('./actions');
const { insertEvent } = require('./database');
const { makeDecision } = require('./decision-engine/decision');
const { applyGuardrails } = require('./guardrails/policy');
const { runShadowDecision } = require('./shadow/shadow-mode');

const router = express.Router();

function verifySignature(body, signature, secret) {
  if (!secret || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  if (expectedSignature.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

function createWebhookRouter(razorpay, webhookSecret) {
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

        if (!isSimulated && webhookSecret) {
          const signature = req.headers['x-razorpay-signature'];

          if (!verifySignature(req.rawBody, signature, webhookSecret)) {
            console.log('❌ Webhook signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
          }
        }

        const body = req.body;

        if (body.event !== 'payment.failed') {
          return res.status(200).json({
            status: 'ignored',
            event: body.event,
          });
        }

        const payment = body.payload?.payment?.entity || {};

        const errorData = {
          error_code: payment.error_code || body.error_code || '',
          error_source: payment.error_source || body.error_source || '',
          error_reason: payment.error_reason || body.error_reason || '',
          error_step: payment.error_step || body.error_step || '',
          error_description:
            payment.error_description ||
            body.error_description ||
            '',
        };

        const paymentData = {
          payment_id:
            payment.id ||
            body.payment_id ||
            `pay_unknown_${uuidv4().slice(0, 8)}`,

          order_id:
            payment.order_id ||
            body.order_id ||
            null,

          amount:
            payment.amount ||
            body.amount ||
            0,

          currency:
            payment.currency ||
            body.currency ||
            'INR',

          method:
            payment.method ||
            body.method ||
            'unknown',

          contact:
            payment.contact ||
            body.contact ||
            '',

          email:
            payment.email ||
            body.email ||
            '',

          attempts:
            payment.attempts ||
            body.attempts ||
            1,
        };

        console.log(`\n${'═'.repeat(60)}`);
        console.log(
          `📥 Payment Failed: ${paymentData.payment_id}`
        );

        console.log(
          `   Amount: ₹${(paymentData.amount / 100).toFixed(2)} | Method: ${paymentData.method}`
        );

        console.log(
          `   Error: [${errorData.error_code}] ${errorData.error_reason} — ${errorData.error_description}`
        );

        // 1. Classify failure
        const { bucket, matchedRule } =
          classifyFailure(errorData);

        console.log(
          `   🏷️ Bucket: ${bucket} (rule: ${matchedRule})`
        );

        // 2. Generate Reflow decision
        const context = {
          issuer:
            payment.issuer ||
            body.issuer ||
            'unknown',

          hour: new Date().getHours(),

          attempt:
            payment.attempts ||
            body.attempts ||
            1,
        };

        const reflowDecision = makeDecision(
          bucket,
          context
        );

        // 3. Apply guardrails
        const guardedDecision = applyGuardrails(
          bucket,
          reflowDecision,
          paymentData
        );

        console.log(
          `   🤖 Reflow Decision: ${guardedDecision.action}`
        );

        console.log(
          `   📊 Score: ${guardedDecision.score}`
        );

        console.log(
          `   🛡️ Guardrail: ${guardedDecision.guardrail_reason}`
        );

        // 4. Execute selected recovery action
        const actionResult = await executeAction(
          bucket,
          paymentData,
          razorpay,
          guardedDecision
        );

        console.log(
          `   🎯 Action: ${actionResult.action_taken} → Outcome: ${actionResult.outcome}`
        );

        // 5. Shadow comparison
        const shadowResult = runShadowDecision(
          actionResult.action_taken,
          guardedDecision
        );

        console.log(
          `   👻 Shadow Mode: ${
            shadowResult.would_change
              ? 'Would change action'
              : 'Same action'
          }`
        );

        // 6. Save complete audit record
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

          reflow_action: guardedDecision.action,
          reflow_score: guardedDecision.score,

          guardrail_applied:
            guardedDecision.guardrail_applied
              ? 1
              : 0,

          guardrail_reason:
            guardedDecision.guardrail_reason,

          action_taken:
            actionResult.action_taken,

          action_detail:
            actionResult.action_detail,

          outcome:
            actionResult.outcome,

          failed_at: payment.created_at
            ? new Date(
                payment.created_at * 1000
              ).toISOString()
            : new Date().toISOString(),

          actioned_at:
            actionResult.actioned_at,

          resolved_at:
            actionResult.resolved_at,
        };

        insertEvent(eventRecord);

        console.log(
          `   💾 Saved to audit log (id: ${eventRecord.id})`
        );

        console.log(`${'═'.repeat(60)}\n`);

        return res.status(200).json({
          status: 'processed',
          id: eventRecord.id,
          bucket,
          reflow_action: guardedDecision.action,
          reflow_score: guardedDecision.score,
          guardrail:
            guardedDecision.guardrail_reason,
          action:
            actionResult.action_taken,
          outcome:
            actionResult.outcome,
        });

      } catch (err) {
        console.error(
          '❌ Webhook processing error:',
          err
        );

        return res.status(500).json({
          error: 'Internal server error',
        });
      }
    }
  );

  return router;
}

module.exports = {
  createWebhookRouter,
};