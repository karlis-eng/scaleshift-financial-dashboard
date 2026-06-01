// Fetches income data from Stripe: charges (payments received) + payouts (bank withdrawals)
// Returns { charges: [...], payouts: [...] }
const https = require('https');
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../../.env');
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

function stripeRequest(secretKey, endpoint) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(secretKey + ':').toString('base64');
    const req = https.request({
      hostname: 'api.stripe.com',
      path: endpoint,
      method: 'GET',
      headers: { Authorization: 'Basic ' + auth }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllPages(secretKey, path) {
  const items = [];
  let url = path + '?limit=100';
  while (url) {
    const res = await stripeRequest(secretKey, url);
    if (res.error) throw new Error('Stripe error: ' + res.error.message);
    items.push(...(res.data || []));
    url = res.has_more ? path + '?limit=100&starting_after=' + res.data[res.data.length - 1].id : null;
  }
  return items;
}

function normaliseCharge(c) {
  return {
    id:          c.id,
    date:        new Date(c.created * 1000).toISOString().slice(0, 10),
    amount:      c.amount / 100,
    currency:    c.currency.toUpperCase(),
    type:        'income',
    source:      'Stripe',
    description: c.description || c.statement_descriptor || '',
    customer:    c.billing_details?.name || c.customer || '',
    status:      c.status,
  };
}

function normalisePayout(p) {
  return {
    id:          p.id,
    date:        new Date(p.created * 1000).toISOString().slice(0, 10),
    amount:      p.amount / 100,
    currency:    p.currency.toUpperCase(),
    type:        'payout',
    source:      'Stripe',
    description: p.description || 'Bank payout',
    status:      p.status,
  };
}

async function main() {
  loadEnv();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set in .env');

  // balance_transactions gives gross, fee, and net per transaction — more accurate than /charges
  // fetch all types then filter to income types (charge + payment cover old and new Stripe integrations)
  const [rawTxns, rawPayouts] = await Promise.all([
    fetchAllPages(key, '/v1/balance_transactions'),
    fetchAllPages(key, '/v1/payouts'),
  ]);

  const charges = rawTxns
    .filter(t => t.type === 'charge' || t.type === 'payment')
    .map(t => ({
      id:          t.id,
      date:        new Date(t.created * 1000).toISOString().slice(0, 10),
      gross:       t.amount / 100,
      fee:         t.fee / 100,
      amount:      t.net / 100,   // net after Stripe fees — used for income calculations
      currency:    t.currency.toUpperCase(),
      type:        'income',
      source:      'Stripe',
      description: t.description || '',
      customer:    t.source?.billing_details?.name || '',
      status:      t.status,
    }));

  const payouts = rawPayouts
    .filter(p => p.status === 'paid')
    .map(normalisePayout);

  const totalGross    = charges.reduce((s, c) => s + c.gross, 0);
  const totalFees     = charges.reduce((s, c) => s + c.fee, 0);
  const totalNet      = charges.reduce((s, c) => s + c.amount, 0);

  console.log(JSON.stringify({ charges, payouts, summary: { totalGross, totalFees, totalNet } }));
}

main().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1); });
