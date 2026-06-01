// Reads daily expense rows from the Finance Tracker Google Sheet (FINANCE_SHEET_ID).
// Outputs JSON array: [{ date, category, type, item, amount }]
const { getAccessToken, apiRequest, loadEnv } = require('./lib/auth');

async function main() {
  loadEnv();
  const sheetId = process.env.FINANCE_SHEET_ID;
  if (!sheetId) { console.log(JSON.stringify([])); return; }

  const token = await getAccessToken();
  const res = await apiRequest(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Expenses!A2:E`
  );

  const rows = (res.values || []).map(r => ({
    category:  r[0] || 'Other',
    type:      r[1] || 'Expense',
    item:      r[2] || '',
    amount:    parseFloat(r[3]) || 0,
    date:      (r[4] || '').slice(0, 10),
    timestamp: r[4] || '',
  })).filter(r => r.date && r.amount > 0);

  console.log(JSON.stringify(rows));
}

main().catch(() => { console.log(JSON.stringify([])); });
