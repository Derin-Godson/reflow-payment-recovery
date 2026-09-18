function runShadowDecision(actualAction, reflowDecision) {
  return {
    mode: 'shadow',
    actual_action: actualAction,
    reflow_action: reflowDecision.action,
    reflow_score: reflowDecision.score,
    would_change: actualAction !== reflowDecision.action,
    evaluated_at: new Date().toISOString(),
  };
}

module.exports = { runShadowDecision };