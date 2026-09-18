function applyGuardrails(bucket, decision, paymentData) {
  const attempts = paymentData.attempts || 1;
  let action = decision.action;
  let reason = 'Approved by policy';

  if (bucket === 'card_declined' && attempts >= 2) {
    action = 'no_retry';
    reason = 'Repeated card decline';
  }

  if (bucket === 'other') {
    action = 'no_retry';
    reason = 'Unknown failure';
  }

  if (bucket === 'network_gateway' && attempts >= 3) {
    action = 'alternate_method';
    reason = 'Retry limit reached';
  }

  return {
    ...decision,
    action,
    guardrail_applied: action !== decision.action,
    guardrail_reason: reason,
  };
}

module.exports = { applyGuardrails };