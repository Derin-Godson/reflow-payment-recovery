# 5-Minute Pitch Video Script

**Target duration:** 5 minutes
**Format:** Screen recording (dashboard + terminal) + talking over it
**Tools suggested:** OBS Studio, Loom, or any screen recorder

---

## INTRO — The Problem (0:00 – 0:45)

> *Show a blank screen or a simple slide with the stats*

**Say:**

"Hey, I'm Atharva, and I built a Payment Failure Root-Cause and Retry Agent for Razorpay.

Here's the problem I'm solving: According to Razorpay's own data, about 70 percent of cart abandonment in India comes from payment failures. And here's the kicker — 80 percent of card payment failures aren't even about insufficient funds or fraud. They're OTP timeouts, authentication issues, or temporary gateway errors.

That means the vast majority of failed payments are recoverable — but most merchants have no intelligent system to classify WHY a payment failed and react differently based on the cause. Every failure gets treated the same way: as a dead end. My agent fixes that."

---

## DEMO PART 1 — Architecture Overview (0:45 – 1:30)

> *Show the terminal — start the server*

**Do:** Run `npm start` in the terminal.

**Say:**

"Let me show you how it works. The agent is a Node.js server that sits behind Razorpay's webhook infrastructure. When a payment fails, Razorpay sends a `payment.failed` webhook to our endpoint.

The agent then does three things in sequence:
1. It classifies the failure into one of five root-cause buckets using a rule-based engine.
2. It takes a different recovery action depending on the bucket.
3. It logs the entire decision chain — failure, classification, action, outcome — into a SQLite audit log.

Let me fire up the simulator to show this end-to-end."

---

## DEMO PART 2 — Running the Simulator (1:30 – 2:30)

> *Open a second terminal — run the simulator*

**Do:** Run `npm run simulate`

> *Let it run — the terminal will show each event being classified and acted on*

**Say:**

"I'm running 50 simulated payment failures through the system. These are realistic webhook payloads matching Razorpay's exact format, with error codes distributed to match real-world failure data — about 35 percent OTP timeouts, 25 percent gateway errors, 15 percent insufficient funds, 15 percent card declined, and 10 percent other.

Watch the terminal — you can see each payment being classified in real time. Look at this one: it's an OTP timeout, so the agent generates a fresh payment link and simulates sending an SMS to the customer. And this one is a gateway error — the agent auto-retries through an alternate route and it succeeds.

Each bucket gets a completely different action:
- Gateway errors get auto-retried after a short delay.
- OTP timeouts get a fresh payment link sent to the customer.
- Insufficient funds get a delayed retry scheduled for the next day.
- Card declines trigger a notification suggesting UPI or net banking instead.
- Unknown errors get flagged for manual review."

---

## DEMO PART 3 — The Dashboard (2:30 – 4:00)

> *Open browser to http://localhost:3000*

**Say:**

"Now let's look at the results. Open the dashboard at localhost 3000.

*(Point to summary cards)*
Here at the top — 50 total failures processed, 22 recovered. That's a 44 percent recovery rate. Without this agent, the recovery rate would be zero — every one of those 50 payments would have been permanently lost.

*(Point to the Before vs. After chart)*
This bar chart shows the impact visually. Zero percent without the agent. 44 percent with it. That's real revenue recovered.

*(Point to the bucket breakdown doughnut)*
This chart shows the distribution of failures by root cause. OTP and auth failures dominate — which matches the real-world data that 80 percent of card failures are authentication-related.

*(Point to the per-bucket recovery chart)*
This is my favorite chart. It proves the differentiated strategy works. Network and gateway errors have a 70 percent recovery rate because they're transient — a retry usually works. OTP failures recover at about 50 percent when you send a fresh payment link. But card declines only recover at 11 percent because the bank is actively blocking the transaction — the right action there is to suggest a different payment method, not retry the same one.

*(Scroll down to audit log table)*
And finally, the audit log — every single event with the full trail: payment ID, amount, root cause bucket, action taken, outcome, and timestamps. This is the core deliverable. It's not just about retrying payments — it's about having a complete, auditable record of every decision the agent made and why."

---

## CLOSING — Impact & What's Next (4:00 – 5:00)

> *Switch back to a clean screen or the dashboard summary*

**Say:**

"So to recap: this agent recovered 44 percent of failed payments in our demo — payments that would have been zero percent recovered without intelligent retry logic. Razorpay's own playbook says smart retries can recover 15 to 20 percent of failed transactions. We exceeded that benchmark.

The architecture is simple and production-ready:
- Node.js and Express for the backend.
- Razorpay's official SDK, initialized from environment variables — keys are never hardcoded.
- SQLite for the audit log — zero config, single file.
- A clean dashboard built with Chart.js — no React, no build step.

Everything is open source on GitHub. The repo includes a BUILD_LOG — an engineering journal documenting every issue I hit during development and how I solved it. It's a real engineering journal, not reconstructed after the fact.

What's next? In production, you'd connect this to real SMS and WhatsApp APIs for customer notifications, add a cron job for the delayed retry queue, and build more sophisticated classification rules based on actual production error data. But the core pipeline — classify, act differently, log everything, measure impact — is working end to end right now.

Thank you for watching."

---

## Recording Tips

1. **Screen layout:** Terminal on the left, browser on the right (or use fullscreen switching).
2. **Before recording:** Run `npm start`, then `npm run simulate --count 50` so the dashboard has data. Or do it live during the recording for more impact.
3. **Speak naturally** — this script is a guide, not a teleprompter. Paraphrase in your own words.
4. **Keep it under 5 minutes** — judges have many submissions to review.
5. **Tools:** Loom (easiest), OBS Studio (free, most control), or Windows Game Bar (Win+G).
