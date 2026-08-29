# BUILD LOG — Payment Failure Root-Cause & Retry Agent

Engineering journal for the Razorpay Buildathon project. Updated incrementally during development.

---

## Step 1 — Tech Stack & Architecture Decision

**Problem:** Choosing between Node.js and Python, and deciding on DB, frontend, and overall architecture.

**Root Cause:** Both stacks are viable; needed to pick one and commit.

**Solution:** Chose Node.js + Express + SQLite (`better-sqlite3`) + vanilla HTML dashboard with Chart.js. Rationale: Razorpay's Node.js SDK is first-class, SQLite is zero-config for a demo, and vanilla HTML avoids React/build-tool overhead. Prioritizing working pipeline over polish per requirements.

**Status:** Resolved

---

## Step 2 — Razorpay Error Code Mapping

**Problem:** Razorpay doesn't publish a single exhaustive list of all `error_reason` values. Needed to build a classifier from scattered documentation.

**Root Cause:** Error codes are spread across multiple doc pages (API errors, payment failures, webhook events) and some codes only appear in production payloads.

**Solution:** Built a composite mapping from Razorpay's error codes docs, webhook docs, and community examples. Key fields used: `error_source`, `error_code`, `error_reason`, `error_step`. Classifier uses a priority-ordered rule chain — most specific matches first, falling through to `other`.

**Status:** Resolved

---

## Step 3 — Simulating Failed Payments Without Live Transactions

**Problem:** Razorpay's test mode requires UI interaction (clicking "Failure" on mock checkout page) — no programmatic API to create a failed payment directly.

**Root Cause:** `payment.failed` events are side effects of the checkout flow, not directly creatable via API.

**Solution:** Built a local simulator (`simulator.js`) that constructs realistic `payment.failed` webhook payloads (matching Razorpay's exact payload structure) and POSTs them to the local webhook endpoint. Webhook handler accepts simulated events when they carry a `X-Simulated-Event: true` header (skipping signature verification). This keeps the demo fully self-contained.

**Status:** Resolved
