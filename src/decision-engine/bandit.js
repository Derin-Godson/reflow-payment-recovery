const ACTIONS = [
  'retry_1h',
  'retry_6h',
  'retry_24h',
  'payment_link',
  'alternate_method',
  'no_retry',
];

const stats = {};

for (const action of ACTIONS) {
  stats[action] = {
    successes: 1,
    failures: 1,
  };
}

function sampleBeta(alpha, beta) {
  let x = 0;
  let y = 0;

  for (let i = 0; i < alpha; i++) {
    x += Math.random();
  }

  for (let i = 0; i < beta; i++) {
    y += Math.random();
  }

  return x / (x + y);
}

function chooseAction(allowedActions = ACTIONS) {
  let bestAction = allowedActions[0];
  let bestScore = -1;

  for (const action of allowedActions) {
    const { successes, failures } = stats[action];

    const score = sampleBeta(successes, failures);

    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return {
    action: bestAction,
    score: Number(bestScore.toFixed(4)),
  };
}

function updateAction(action, outcome) {
  if (!stats[action]) {
    stats[action] = {
      successes: 1,
      failures: 1,
    };
  }

  if (outcome === 'recovered') {
    stats[action].successes += 1;
  } else {
    stats[action].failures += 1;
  }
}

function getStats() {
  return JSON.parse(JSON.stringify(stats));
}

module.exports = {
  ACTIONS,
  chooseAction,
  updateAction,
  getStats,
};