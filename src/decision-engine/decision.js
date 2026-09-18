const { chooseAction } = require('./bandit');

function getAllowedActions(bucket) {
  const actions = {
    network_gateway: ['retry_1h', 'retry_6h', 'alternate_method'],
    otp_auth: ['retry_1h', 'retry_6h', 'payment_link'],
    insufficient_funds: ['retry_24h', 'payment_link'],
    card_declined: ['alternate_method', 'payment_link', 'no_retry'],
    other: ['no_retry'],
  };

  return actions[bucket] || ['no_retry'];
}

function makeDecision(bucket, context = {}) {
  const allowedActions = getAllowedActions(bucket);

  const result = chooseAction(allowedActions);

  return {
    action: result.action,
    score: result.score,
    bucket,
    issuer: context.issuer || 'unknown',
    hour: context.hour ?? new Date().getHours(),
    attempt: context.attempt || 1,
  };
}

module.exports = {
  makeDecision,
  getAllowedActions,
};