/**
 * Action engine — takes a differentiated recovery action based on the
 * root-cause bucket assigned by the classifier.
 *
 * In demo/test mode, Razorpay API calls (payment link creation) are attempted
 * if credentials are present, otherwise simulated. Retry outcomes are
 * probabilistically simulated to demonstrate the recovery-rate dashboard.
 */

const { v4: uuidv4 } = require('uuid');

// ── Simulated outcome probabilities per bucket ──────────────────────────────

const RECOVERY_RATES = {
  network_gateway: 0.70,   // High — transient errors usually resolve on retry
  otp_auth: 0.45,          // Medium — fresh link helps but user may still drop off
  insufficient_funds: 0.20, // Low — user needs to add money
  card_declined: 0.10,      // Very low — bank-side block
  other: 0.05,              // Minimal — unknown issues
};

/**
 * Simulate whether a retry/recovery action succeeds.
 */
function simulateOutcome(bucket) {
  const rate = RECOVERY_RATES[bucket] || 0.05;
  return Math.random() < rate ? 'recovered' : 'failed';
}

// ── Per-bucket action handlers ──────────────────────────────────────────────

/**
 * Network/gateway error → auto-retry through alternate route after short delay.
 */
async function handleNetworkGateway(paymentData, razorpay) {
  const delayMs = 5000; // 5-second delay before retry
  const now = new Date().toISOString();

  console.log(
    `⚡ [network_gateway] Auto-retrying payment ${paymentData.payment_id} after ${delayMs}ms delay...`
  );

  // Simulate the delay (shortened for demo)
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 1000)));

  // Attempt to create a payment link via Razorpay API (if available)
  let paymentLinkUrl = null;
  let retryPaymentId = null;

  if (razorpay) {
    try {
      const link = await razorpay.paymentLink.create({
        amount: paymentData.amount || 50000,
        currency: paymentData.currency || 'INR',
        description: `Retry for failed payment ${paymentData.payment_id}`,
        customer: {
          email: paymentData.email || 'customer@example.com',
          contact: paymentData.contact || '+919999999999',
        },
        notify: { sms: false, email: false },
        callback_url: 'https://example.com/callback',
        callback_method: 'get',
      });
      paymentLinkUrl = link.short_url;
      retryPaymentId = link.id;
      console.log(`  ✅ Payment link created: ${paymentLinkUrl}`);
    } catch (err) {
      console.log(`  ⚠️  Razorpay API call failed (${err.message}), using simulated retry.`);
    }
  }

  const outcome = simulateOutcome('network_gateway');
  console.log(`  📊 Retry outcome: ${outcome}`);

  return {
    action_taken: 'auto_retry',
    action_detail: JSON.stringify({
      delay_ms: delayMs,
      retry_payment_id: retryPaymentId,
      payment_link_url: paymentLinkUrl,
      route: 'alternate_gateway',
    }),
    outcome,
    actioned_at: now,
    resolved_at: outcome === 'recovered' ? now : null,
  };
}

/**
 * OTP/auth failure → generate and send a fresh payment link.
 */
async function handleOtpAuth(paymentData, razorpay) {
  const now = new Date().toISOString();

  console.log(
    `🔑 [otp_auth] Generating fresh payment link for ${paymentData.payment_id}...`
  );

  let paymentLinkUrl = null;
  let paymentLinkId = null;

  if (razorpay) {
    try {
      const link = await razorpay.paymentLink.create({
        amount: paymentData.amount || 50000,
        currency: paymentData.currency || 'INR',
        description: `Fresh payment link — retry for ${paymentData.payment_id}`,
        customer: {
          email: paymentData.email || 'customer@example.com',
          contact: paymentData.contact || '+919999999999',
        },
        notify: { sms: false, email: false },
        callback_url: 'https://example.com/callback',
        callback_method: 'get',
      });
      paymentLinkUrl = link.short_url;
      paymentLinkId = link.id;
      console.log(`  ✅ Payment link created: ${paymentLinkUrl}`);
    } catch (err) {
      console.log(`  ⚠️  Razorpay API call failed (${err.message}), simulating link creation.`);
      paymentLinkUrl = `https://rzp.io/simulated/${uuidv4().slice(0, 8)}`;
      paymentLinkId = `plink_sim_${uuidv4().slice(0, 12)}`;
    }
  } else {
    paymentLinkUrl = `https://rzp.io/simulated/${uuidv4().slice(0, 8)}`;
    paymentLinkId = `plink_sim_${uuidv4().slice(0, 12)}`;
  }

  // Simulate sending SMS/WhatsApp
  console.log(
    `  📱 [SIMULATED] SMS sent to ${paymentData.contact || '+919999999999'}: "Complete your payment here: ${paymentLinkUrl}"`
  );

  const outcome = simulateOutcome('otp_auth');
  console.log(`  📊 Recovery outcome: ${outcome}`);

  return {
    action_taken: 'payment_link',
    action_detail: JSON.stringify({
      payment_link_id: paymentLinkId,
      payment_link_url: paymentLinkUrl,
      notification_channel: 'sms_simulated',
      customer_contact: paymentData.contact || '+919999999999',
    }),
    outcome,
    actioned_at: now,
    resolved_at: outcome === 'recovered' ? now : null,
  };
}

/**
 * Insufficient funds → schedule a delayed retry (next day).
 */
async function handleInsufficientFunds(paymentData) {
  const now = new Date();
  const scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 hours

  console.log(
    `💰 [insufficient_funds] Scheduling delayed retry for ${paymentData.payment_id} at ${scheduledAt.toISOString()}`
  );

  const outcome = simulateOutcome('insufficient_funds');
  console.log(`  📊 Projected outcome: ${outcome}`);

  return {
    action_taken: 'scheduled_retry',
    action_detail: JSON.stringify({
      scheduled_at: scheduledAt.toISOString(),
      delay_hours: 24,
      reason: 'Waiting for customer to add funds',
    }),
    outcome,
    actioned_at: now.toISOString(),
    resolved_at: outcome === 'recovered' ? now.toISOString() : null,
  };
}

/**
 * Card declined → notify customer to try alternate payment method.
 */
async function handleCardDeclined(paymentData) {
  const now = new Date().toISOString();

  console.log(
    `🚫 [card_declined] Notifying customer about declined card for ${paymentData.payment_id}`
  );
  console.log(
    `  📱 [SIMULATED] SMS to ${paymentData.contact || '+919999999999'}: "Your card payment was declined by your bank. Please try UPI, net banking, or a different card."`
  );

  const outcome = simulateOutcome('card_declined');
  console.log(`  📊 Recovery outcome: ${outcome}`);

  return {
    action_taken: 'notify_customer',
    action_detail: JSON.stringify({
      notification_type: 'alternate_method_suggestion',
      channel: 'sms_simulated',
      message: 'Card declined by bank — try UPI, net banking, or a different card.',
    }),
    outcome,
    actioned_at: now,
    resolved_at: outcome === 'recovered' ? now : null,
  };
}

/**
 * Other/unclassified → flag for manual review, no automated action.
 */
async function handleOther(paymentData) {
  const now = new Date().toISOString();

  console.log(
    `❓ [other] Flagging payment ${paymentData.payment_id} for manual review`
  );

  return {
    action_taken: 'manual_review',
    action_detail: JSON.stringify({
      reason: 'Unclassified failure — requires human investigation',
    }),
    outcome: 'pending',
    actioned_at: now,
    resolved_at: null,
  };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

const ACTION_HANDLERS = {
  network_gateway: handleNetworkGateway,
  otp_auth: handleOtpAuth,
  insufficient_funds: handleInsufficientFunds,
  card_declined: handleCardDeclined,
  other: handleOther,
};

/**
 * Execute the appropriate recovery action for a classified failure.
 *
 * @param {string} bucket - The root-cause bucket.
 * @param {Object} paymentData - Payment details from the webhook.
 * @param {Object|null} razorpay - Razorpay SDK instance (null = simulate).
 * @returns {Promise<Object>} Action result with action_taken, outcome, etc.
 */
async function executeAction(bucket, paymentData, razorpay) {
  const handler = ACTION_HANDLERS[bucket] || ACTION_HANDLERS.other;
  return handler(paymentData, razorpay);
}

module.exports = { executeAction, RECOVERY_RATES, ACTION_HANDLERS };
