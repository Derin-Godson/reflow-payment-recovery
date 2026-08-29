/**
 * Simulator — generates a batch of realistic payment.failed webhook payloads
 * and POSTs them to the local webhook endpoint.
 *
 * Usage:
 *   node src/simulator.js              # default 50 events
 *   node src/simulator.js --count 100  # custom count
 */

const http = require('http');

const BASE_URL = process.env.SIMULATOR_URL || 'http://localhost:3000';
const DEFAULT_COUNT = 50;

// ── Parse CLI args ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let count = DEFAULT_COUNT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10) || DEFAULT_COUNT;
    }
  }
  return { count };
}

// ── Test data generators ────────────────────────────────────────────────────

const FIRST_NAMES = ['Aarav', 'Priya', 'Rohan', 'Sneha', 'Vikram', 'Ananya', 'Karan', 'Diya', 'Arjun', 'Meera'];
const LAST_NAMES = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Joshi', 'Mehta', 'Das', 'Nair'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount() {
  // ₹100 to ₹5,000 in paise
  return (Math.floor(Math.random() * 4900) + 100) * 100;
}

function randomPhone() {
  return `+91${Math.floor(9000000000 + Math.random() * 999999999)}`;
}

function generateCustomer() {
  const first = randomItem(FIRST_NAMES);
  const last = randomItem(LAST_NAMES);
  return {
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    contact: randomPhone(),
  };
}

// ── Error templates per bucket ──────────────────────────────────────────────

const ERROR_TEMPLATES = {
  network_gateway: [
    {
      error_code: 'GATEWAY_ERROR',
      error_source: 'gateway',
      error_reason: 'gateway_technical_error',
      error_step: 'payment_authorization',
      error_description: 'Payment processing failed due to gateway technical error',
      method: 'card',
    },
    {
      error_code: 'GATEWAY_ERROR',
      error_source: 'gateway',
      error_reason: 'bank_downtime',
      error_step: 'payment_authorization',
      error_description: 'Bank servers are currently experiencing downtime',
      method: 'netbanking',
    },
    {
      error_code: 'GATEWAY_ERROR',
      error_source: 'gateway',
      error_reason: 'network_error',
      error_step: 'payment_authorization',
      error_description: 'Network connectivity error during payment processing',
      method: 'card',
    },
    {
      error_code: 'GATEWAY_ERROR',
      error_source: 'gateway',
      error_reason: 'gateway_error',
      error_step: 'payment_authorization',
      error_description: 'Gateway returned an unexpected error response',
      method: 'upi',
    },
  ],
  otp_auth: [
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_reason: 'invalid_otp',
      error_step: 'payment_authentication',
      error_description: 'Authentication failed due to incorrect OTP',
      method: 'card',
    },
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_reason: 'authentication_failed',
      error_step: 'payment_authentication',
      error_description: '3D Secure authentication failed',
      method: 'card',
    },
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_reason: 'payment_timed_out',
      error_step: 'payment_authentication',
      error_description: 'Customer did not complete authentication within the time limit',
      method: 'card',
    },
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_reason: 'payment_timed_out',
      error_step: 'payment_authentication',
      error_description: 'OTP entry timed out — customer did not respond',
      method: 'netbanking',
    },
  ],
  insufficient_funds: [
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_reason: 'insufficient_funds',
      error_step: 'payment_authorization',
      error_description: 'Payment failed due to insufficient funds in account',
      method: 'card',
    },
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_reason: 'insufficient_funds',
      error_step: 'payment_authorization',
      error_description: 'Insufficient balance in the customer wallet',
      method: 'wallet',
    },
  ],
  card_declined: [
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'gateway',
      error_reason: 'card_declined',
      error_step: 'payment_authorization',
      error_description: 'Card was declined by the issuing bank',
      method: 'card',
    },
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'gateway',
      error_reason: 'card_declined',
      error_step: 'payment_authorization',
      error_description: 'Do not honour — card declined by issuing bank',
      method: 'card',
    },
  ],
  other: [
    {
      error_code: 'BAD_REQUEST_ERROR',
      error_source: 'customer',
      error_reason: 'payment_cancelled',
      error_step: 'payment_authorization',
      error_description: 'Customer cancelled the payment',
      method: 'upi',
    },
    {
      error_code: 'SERVER_ERROR',
      error_source: 'razorpay',
      error_reason: 'server_error',
      error_step: 'payment_initiation',
      error_description: 'An internal server error occurred',
      method: 'card',
    },
  ],
};

// ── Distribution matching real-world Razorpay failure data ──────────────────

const BUCKET_DISTRIBUTION = [
  { bucket: 'otp_auth', weight: 35 },
  { bucket: 'network_gateway', weight: 25 },
  { bucket: 'insufficient_funds', weight: 15 },
  { bucket: 'card_declined', weight: 15 },
  { bucket: 'other', weight: 10 },
];

function pickBucket() {
  const total = BUCKET_DISTRIBUTION.reduce((s, b) => s + b.weight, 0);
  let rand = Math.random() * total;
  for (const entry of BUCKET_DISTRIBUTION) {
    rand -= entry.weight;
    if (rand <= 0) return entry.bucket;
  }
  return 'other';
}

// ── Build a single webhook payload ──────────────────────────────────────────

let paymentCounter = 0;

function buildPayload() {
  paymentCounter++;
  const bucket = pickBucket();
  const template = randomItem(ERROR_TEMPLATES[bucket]);
  const customer = generateCustomer();
  const amount = randomAmount();
  const paymentId = `pay_test_${Date.now()}_${paymentCounter}`;
  const orderId = `order_test_${Date.now()}_${paymentCounter}`;

  return {
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: 'payment',
          amount,
          currency: 'INR',
          status: 'failed',
          order_id: orderId,
          method: template.method,
          description: `Test payment #${paymentCounter}`,
          contact: customer.contact,
          email: customer.email,
          error_code: template.error_code,
          error_source: template.error_source,
          error_reason: template.error_reason,
          error_step: template.error_step,
          error_description: template.error_description,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

// ── Send a single event to the webhook endpoint ─────────────────────────────

function sendEvent(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const url = new URL(`${BASE_URL}/webhook/razorpay`);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Simulated-Event': 'true',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { count } = parseArgs();

  console.log(`\n🎯 Payment Failure Simulator`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`Generating ${count} simulated payment.failed events...`);
  console.log(`Target: ${BASE_URL}/webhook/razorpay\n`);

  const results = { total: 0, success: 0, error: 0, buckets: {} };

  for (let i = 0; i < count; i++) {
    const payload = buildPayload();
    const bucket =
      payload.payload.payment.entity.error_reason || 'unknown';

    try {
      const res = await sendEvent(payload);
      results.total++;

      if (res.status === 200) {
        results.success++;
        const b = res.body.bucket || 'unknown';
        results.buckets[b] = (results.buckets[b] || 0) + 1;
      } else {
        results.error++;
        console.log(`  ❌ Event ${i + 1} failed: HTTP ${res.status}`);
      }
    } catch (err) {
      results.error++;
      console.log(`  ❌ Event ${i + 1} failed: ${err.message}`);
    }

    // Small delay to avoid overwhelming the server
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Simulation Complete`);
  console.log(`   Total sent:     ${results.total}`);
  console.log(`   Processed:      ${results.success}`);
  console.log(`   Errors:         ${results.error}`);
  console.log(`\n   Bucket distribution:`);
  for (const [bucket, count] of Object.entries(results.buckets).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / results.total) * 100).toFixed(1);
    console.log(`     ${bucket.padEnd(20)} ${count} (${pct}%)`);
  }
  console.log(`\n   📊 View dashboard: ${BASE_URL}\n`);
}

main().catch((err) => {
  console.error('Simulator error:', err);
  process.exit(1);
});
