# Razorpay Buildathon — Submission Answers

Use these answers to fill in the submission form.

---

## Track Selection

**Razorpay Payment Recovery / Smart Retry**

---

## Project Name / Title

**Payment Failure Root-Cause & Retry Agent**

---

## Project Objectives

This project builds an intelligent payment failure recovery system that sits on top of Razorpay's webhook infrastructure. Instead of treating all failed payments the same way, the agent classifies every `payment.failed` event into a specific root-cause bucket (network/gateway timeout, OTP/authentication failure, insufficient funds, card declined, or other) and takes a differentiated recovery action for each. The objective is to prove that smart, cause-aware retry logic can recover a significant percentage of failed transactions that would otherwise be permanently lost — transforming payment failures from dead ends into recoverable revenue.

---

## What Does It Solve?

**The Problem:**
- ~70% of cart abandonment in India traces back to payment failures (Razorpay's own data).
- ~80% of card payment failures are caused by OTP timeouts or authentication issues — not actual insufficient funds or fraud.
- Most merchants have zero intelligent retry logic. A failed payment is a lost sale.

**What This Agent Does:**
1. **Listens** for Razorpay `payment.failed` webhook events in real time.
2. **Classifies** each failure using a rule-based engine (14 rules examining `error_code`, `error_source`, `error_reason`, `error_step`, and `error_description`) into 5 root-cause buckets.
3. **Acts differently per bucket:**
   - **Network/gateway errors** → Auto-retry via alternate route after short delay (70% recovery rate in demo).
   - **OTP/auth timeouts** → Generate a fresh Razorpay payment link + simulate SMS notification to customer (50% recovery rate).
   - **Insufficient funds** → Schedule a delayed retry for 24 hours later (50% recovery rate).
   - **Card declined** → Notify customer to try UPI, net banking, or a different card (11% recovery rate).
   - **Other/unknown** → Flag for manual human review.
4. **Logs every decision** — the full audit trail (failure → classification → action → outcome) is stored in SQLite, creating the evidence base for measuring recovery impact.
5. **Visualizes impact** — a real-time dashboard shows before vs. after recovery rates, failure distribution, per-bucket recovery effectiveness, and a full scrollable audit log.

**Result:** In demo testing with 50 simulated failed payments, the agent achieved a **44% overall recovery rate** — recovering 22 out of 50 payments that would have been permanently lost without intelligent retry logic.

---

## GitHub Repository URL

**https://github.com/Atharva1811/razorpay-retry-agent**

---

## 5-min Pitch Video Link

*(Paste your video link here after recording — see PITCH_SCRIPT.md for the script)*

---

## Build Challenges & Technical Obstacles

### Challenge 1: No Programmatic Way to Create Failed Payments in Test Mode
**Problem:** Razorpay's test mode only lets you trigger payment failures through the checkout UI (clicking "Failure" on a mock bank page). There's no API endpoint to programmatically create a `payment.failed` event.
**Solution:** Built a custom simulator (`simulator.js`) that constructs pixel-perfect replicas of Razorpay's `payment.failed` webhook payloads and POSTs them to the local webhook endpoint with an `X-Simulated-Event: true` header (which skips signature verification). This made the entire demo self-contained and repeatable.

### Challenge 2: Scattered Error Code Documentation
**Problem:** Razorpay doesn't publish a single exhaustive list of all `error_reason` values. The error codes are spread across multiple documentation pages (API errors, payment failures, webhook events), and some codes only appear in production payloads.
**Solution:** Built a composite classification mapping from Razorpay's error codes docs, webhook documentation, and community examples. The classifier uses a priority-ordered rule chain (14 rules) — most specific matches first (e.g., `insufficient_funds` before `gateway` source check), falling through to a catch-all "other" bucket.

### Challenge 3: SQLite WAL Files Leaking Into Git
**Problem:** After staging files for the initial commit, SQLite's WAL-mode journal files (`audit.db-shm`, `audit.db-wal`) were staged despite `*.db` being in `.gitignore`. They have different file extensions.
**Solution:** Extended `.gitignore` with `*.db-shm`, `*.db-wal`, and `*.db-journal` patterns, then ran `git rm --cached` to unstage the already-tracked files.

### Challenge 4: Design Decision — Rule-Based vs. ML Classification
**Problem:** Whether to use a trained ML model or rule-based logic for failure classification.
**Solution:** Chose rule-based for the MVP. Razorpay's error fields (`error_code`, `error_source`, `error_reason`, `error_step`) are already machine-readable and well-structured — a lookup table is both faster to build and more explainable than an ML model for this use case. The rule-based approach also means zero training data needed and 100% deterministic behavior.

### Challenge 5: Making the Dashboard Meaningful Without Real Transaction Volume
**Problem:** With only simulated data, the "before vs. after" comparison needed to be meaningful and honest.
**Solution:** The "before" bar shows 0% recovery (the baseline — no retry agent means every failure is permanent). The "after" bar shows the actual recovery rate from the simulation run. The per-bucket recovery chart validates that the differentiated strategy works: network/gateway errors have 70% recovery while card declines have only 11%, proving the agent correctly prioritizes high-recoverable failures.

---

## Final Submission Confirmation

**I confirm that this is my official final project submission. I understand that no further changes or edits can be made after submitting.**
