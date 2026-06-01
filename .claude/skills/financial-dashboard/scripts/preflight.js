// Pre-flight: verifies all required credentials and API connectivity
// Errors on missing required keys; warns (non-fatal) if Upwork not yet configured
const { getAccessToken, apiRequest } = require('./lib/auth');
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

function stripeCheck(secretKey) {
  return new Promise((resolve) => {
    const auth = Buffer.from(secretKey + ':').toString('base64');
    const req = https.request({
      hostname: 'api.stripe.com', path: '/v1/balance', method: 'GET',
      headers: { Authorization: 'Basic ' + auth }
    }, res => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.error) resolve({ ok: false, error: json.error.message });
        else resolve({ ok: true, currency: json.available?.[0]?.currency?.toUpperCase() });
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

async function main() {
  loadEnv();
  const warnings = [];

  // Required
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN', 'INVOICE_SHEET_ID', 'STRIPE_SECRET_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error('Missing required env vars: ' + missing.join(', '));

  // Google Sheets
  const token = await getAccessToken();
  const sheet = await apiRequest(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${process.env.INVOICE_SHEET_ID}?fields=properties.title`
  );
  if (sheet.error) throw new Error('Sheets auth failed: ' + sheet.error.message);

  // Stripe
  const stripe = await stripeCheck(process.env.STRIPE_SECRET_KEY);
  if (!stripe.ok) throw new Error('Stripe auth failed: ' + stripe.error);

  // Upwork (optional — warn only)
  if (!process.env.UPWORK_ACCESS_TOKEN) {
    warnings.push('Upwork not connected — income will show Stripe only. Add UPWORK_ACCESS_TOKEN to .env to activate.');
  }

  // Wise (optional — warn only)
  if (!process.env.WISE_API_KEY) {
    warnings.push('Wise not connected — bank transactions and subscriptions tab unavailable. Add WISE_API_KEY to .env to activate.');
  }

  console.log(JSON.stringify({
    ok: true,
    sheet: sheet.properties?.title,
    stripe: `connected (${stripe.currency})`,
    upwork: process.env.UPWORK_ACCESS_TOKEN ? 'connected' : 'not configured',
    wise: process.env.WISE_API_KEY ? 'connected' : 'not configured',
    warnings,
  }));
}

main().catch(e => { console.error(JSON.stringify({ ok: false, error: e.message })); process.exit(1); });
