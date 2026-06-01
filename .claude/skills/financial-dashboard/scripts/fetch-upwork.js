// Fetches earnings/withdrawal data from Upwork API.
// STUBBED until UPWORK_ACCESS_TOKEN is configured.
// Run /upwork-auth skill to set up credentials.
const path = require('path');
const fs = require('fs');
const https = require('https');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../../.env');
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

function upworkRequest(token, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.upwork.com',
      path,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  loadEnv();
  const accessToken = process.env.UPWORK_ACCESS_TOKEN;

  if (!accessToken) {
    console.log(JSON.stringify({
      stubbed: true,
      transactions: [],
      message: 'Upwork not connected. To activate: register an app at upwork.com/services/api, add UPWORK_CLIENT_ID + UPWORK_CLIENT_SECRET to .env, then run the upwork-auth flow to get UPWORK_ACCESS_TOKEN.'
    }));
    return;
  }

  // Get current user info first to get freelancer ID
  const user = await upworkRequest(accessToken, '/api/auth/v1/info.json');
  if (user.error) throw new Error('Upwork auth failed: ' + JSON.stringify(user.error));

  const uid = user.server_time ? null : user?.info?.ref;
  if (!uid) throw new Error('Could not determine Upwork user ID from auth response');

  // Fetch earnings transactions (last 12 months)
  const now = new Date();
  const fromDate = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);

  const earnings = await upworkRequest(accessToken,
    `/api/reports/v1/finance/freelancers/${uid}/transactions.json?tq=SELECT+*+WHERE+date+>=+'${fromDate}'+AND+date+<=+'${toDate}'`
  );

  const transactions = (earnings?.table?.rows || []).map(row => {
    const cols = earnings.table.cols.map(c => c.label);
    const get = label => row.c[cols.indexOf(label)]?.v;
    return {
      id:          get('reference') || '',
      date:        get('date') || '',
      amount:      parseFloat(get('amount') || 0),
      currency:    'USD',
      type:        parseFloat(get('amount') || 0) > 0 ? 'income' : 'withdrawal',
      source:      'Upwork',
      description: get('description') || get('type') || '',
    };
  }).filter(t => t.date);

  console.log(JSON.stringify({ stubbed: false, transactions }));
}

main().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1); });
