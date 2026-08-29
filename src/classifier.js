/**
 * Rule-based classifier for Razorpay payment failure events.
 *
 * Maps the error fields from a payment.failed webhook payload
 * to one of five root-cause buckets:
 *   - network_gateway
 *   - otp_auth
 *   - insufficient_funds
 *   - card_declined
 *   - other
 */

// ── Rule definitions (evaluated top-to-bottom, first match wins) ────────────

const RULES = [
  // ── Insufficient funds (most specific, check first) ────────────────────
  {
    bucket: 'insufficient_funds',
    name: 'error_reason:insufficient_funds',
    test: (err) => err.error_reason === 'insufficient_funds',
  },
  {
    bucket: 'insufficient_funds',
    name: 'description:insufficient',
    test: (err) =>
      (err.error_description || '').toLowerCase().includes('insufficient fund'),
  },

  // ── Card declined by issuing bank ──────────────────────────────────────
  {
    bucket: 'card_declined',
    name: 'error_reason:card_declined',
    test: (err) => err.error_reason === 'card_declined',
  },
  {
    bucket: 'card_declined',
    name: 'description:declined',
    test: (err) => {
      const desc = (err.error_description || '').toLowerCase();
      return (
        desc.includes('declined by bank') ||
        desc.includes('card declined') ||
        desc.includes('do not honour') ||
        desc.includes('do not honor')
      );
    },
  },

  // ── OTP / Authentication failure ───────────────────────────────────────
  {
    bucket: 'otp_auth',
    name: 'error_reason:invalid_otp',
    test: (err) => err.error_reason === 'invalid_otp',
  },
  {
    bucket: 'otp_auth',
    name: 'error_reason:authentication_failed',
    test: (err) => err.error_reason === 'authentication_failed',
  },
  {
    bucket: 'otp_auth',
    name: 'error_reason:payment_timed_out',
    test: (err) => err.error_reason === 'payment_timed_out',
  },
  {
    bucket: 'otp_auth',
    name: 'error_step:payment_authentication',
    test: (err) => err.error_step === 'payment_authentication',
  },
  {
    bucket: 'otp_auth',
    name: 'description:otp_or_auth',
    test: (err) => {
      const desc = (err.error_description || '').toLowerCase();
      return (
        desc.includes('otp') ||
        desc.includes('authentication failed') ||
        desc.includes('3d secure') ||
        desc.includes('timed out')
      );
    },
  },

  // ── Network / gateway error ────────────────────────────────────────────
  {
    bucket: 'network_gateway',
    name: 'error_code:GATEWAY_ERROR',
    test: (err) => err.error_code === 'GATEWAY_ERROR',
  },
  {
    bucket: 'network_gateway',
    name: 'error_source:gateway',
    test: (err) => err.error_source === 'gateway',
  },
  {
    bucket: 'network_gateway',
    name: 'error_reason:gateway_error',
    test: (err) =>
      ['gateway_error', 'gateway_technical_error', 'bank_downtime', 'network_error'].includes(
        err.error_reason
      ),
  },
  {
    bucket: 'network_gateway',
    name: 'description:gateway_or_network',
    test: (err) => {
      const desc = (err.error_description || '').toLowerCase();
      return (
        desc.includes('gateway') ||
        desc.includes('network error') ||
        desc.includes('bank downtime') ||
        desc.includes('connectivity')
      );
    },
  },
];

/**
 * Classify a payment failure into a root-cause bucket.
 *
 * @param {Object} errorPayload - The error object from the webhook payload.
 *   Expected fields: error_code, error_source, error_reason, error_step, error_description
 * @returns {{ bucket: string, matchedRule: string }}
 */
function classifyFailure(errorPayload) {
  const err = {
    error_code: errorPayload.error_code || '',
    error_source: errorPayload.error_source || '',
    error_reason: errorPayload.error_reason || '',
    error_step: errorPayload.error_step || '',
    error_description: errorPayload.error_description || '',
  };

  for (const rule of RULES) {
    if (rule.test(err)) {
      return {
        bucket: rule.bucket,
        matchedRule: rule.name,
      };
    }
  }

  return {
    bucket: 'other',
    matchedRule: 'fallback:no_match',
  };
}

/**
 * Human-readable label for each bucket.
 */
const BUCKET_LABELS = {
  network_gateway: 'Network / Gateway Timeout',
  otp_auth: 'OTP / Authentication Failure',
  insufficient_funds: 'Insufficient Funds',
  card_declined: 'Card Declined by Issuing Bank',
  other: 'Other / Unclassified',
};

module.exports = { classifyFailure, BUCKET_LABELS, RULES };
