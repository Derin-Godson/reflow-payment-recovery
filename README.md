# ⚡ Payment Failure Root-Cause & Retry Agent

**An AI-assisted agent that classifies Razorpay payment failures by root cause and takes intelligent, differentiated recovery actions — with full audit logging and a real-time dashboard.**

Built for the [Razorpay Buildathon](https://razorpay.com).

---

## The Problem

- **~70% of cart abandonment in India** traces back to payment failures.
- **~80% of card payment failures** are caused by OTP timeouts or authentication issues — not actual insufficient funds or fraud.
- **Smart automated retries can recover 15–20% of failed transactions**, but most merchants have no intelligent layer that classifies *why* a payment failed and reacts differently based on the cause.

## How It Works

```
payment.failed webhook → Classifier → Action Engine → Audit Log → Dashboard
```

### 1. Classification Engine

Every failed payment is classified into one of **5 root-cause buckets** using a rule-based classifier that examines Razorpay's `error_code`, `error_source`, `error_reason`, `error_step`, and `error_description`:

| Bucket | Matching Signals |
|---|---|
| 🌐 **Network / Gateway** | `GATEWAY_ERROR`, `bank_downtime`, `network_error`, `gateway_technical_error` |
| 🔑 **OTP / Auth Failure** | `invalid_otp`, `authentication_failed`, `payment_timed_out`, `payment_authentication` step |
| 💰 **Insufficient Funds** | `insufficient_funds` reason or description |
| 🚫 **Card Declined** | `card_declined`, "do not honour" in description |
| ❓ **Other** | Anything that doesn't match the above |

### 2. Differentiated Actions

Each bucket triggers a **different recovery strategy**:

| Bucket | Action | Rationale |
|---|---|---|
| 🌐 Network/Gateway | Auto-retry via alternate route after 5s delay | Transient errors usually resolve on retry |
| 🔑 OTP/Auth | Generate fresh payment link + notify customer | Customer needs a new chance to authenticate |
| 💰 Insufficient Funds | Schedule delayed retry (24h) | Customer needs time to add funds |
| 🚫 Card Declined | Notify customer to use alternate method | Bank-side block; different method needed |
| ❓ Other | Flag for manual review | Unknown issues need human investigation |

### 3. Audit Trail

Every event is logged as: **Failure → Classification → Action → Outcome**

The SQLite database captures: payment ID, amount, error details, classified bucket, matched rule, action taken, action details (JSON), outcome, and all timestamps.

### 4. Recovery Dashboard

A real-time dashboard showing:
- **Before vs. After** recovery rate comparison
- **Failure distribution** by root cause (doughnut chart)
- **Per-bucket recovery rates** (horizontal bar chart)
- **Outcome distribution** (recovered / failed / pending)
- **Full audit log** table with every event

---

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Razorpay test mode API keys ([get them here](https://dashboard.razorpay.com/app/keys))

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Atharva1811/razorpay-retry-agent.git
cd razorpay-retry-agent

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env and add your Razorpay test keys:
#   RAZORPAY_KEY_ID=rzp_test_...
#   RAZORPAY_KEY_SECRET=...
```

### Run the Demo

```bash
# Terminal 1: Start the server
npm start

# Terminal 2: Run the simulator (generates 50 failed payment events)
npm run simulate

# Open the dashboard
# Navigate to http://localhost:3000
```

The simulator generates 50 realistic `payment.failed` events with a distribution matching real-world Razorpay failure data:
- 35% OTP/auth failures
- 25% network/gateway errors
- 15% insufficient funds
- 15% card declined
- 10% other

You can customize the count:
```bash
node src/simulator.js --count 100
```

### Running Without API Keys

The agent works in **simulation-only mode** without Razorpay API keys. The classifier, action engine, audit log, and dashboard all function normally — only actual Razorpay API calls (like creating payment links) are simulated.

---

## Project Structure

```
├── .env.example          # Environment variable template
├── .gitignore            # Keeps .env, node_modules, DB out of git
├── BUILD_LOG.md          # Engineering journal (issues, decisions, solutions)
├── README.md             # This file
├── package.json          # Dependencies and scripts
├── public/
│   └── index.html        # Dashboard UI (vanilla HTML + Chart.js)
└── src/
    ├── server.js         # Express entry point
    ├── classifier.js     # Rule-based failure classifier
    ├── actions.js        # Bucket-specific recovery actions
    ├── database.js       # SQLite schema + queries
    ├── webhook.js        # POST /webhook/razorpay handler
    ├── dashboard.js      # GET /api/dashboard routes
    └── simulator.js      # Batch payment failure simulator
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/webhook/razorpay` | Receives `payment.failed` webhook events |
| GET | `/api/dashboard` | Dashboard summary statistics |
| GET | `/api/events` | Paginated audit log entries |
| POST | `/api/reset` | Clear all audit data |
| GET | `/health` | Health check |

---

## Tech Stack

- **Runtime:** Node.js + Express
- **Payment SDK:** Razorpay Node.js SDK
- **Database:** SQLite via `better-sqlite3`
- **Dashboard:** Vanilla HTML + CSS + Chart.js (CDN)
- **No build step required** — just `npm install` and `npm start`

## License

MIT
