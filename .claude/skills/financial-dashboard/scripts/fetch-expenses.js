// Reads all expense/income rows from the SCALESHIFT INVOICES Google Sheet
// Returns { rows: [{ date, vendor, invoiceNumber, amount, currency, type, category, fileLink }] }
const { getAccessToken, apiRequest } = require('./lib/auth');

async function main() {
  const token = await getAccessToken();
  const sheetId = process.env.INVOICE_SHEET_ID;
  if (!sheetId) throw new Error('INVOICE_SHEET_ID not set in .env');

  const res = await apiRequest(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1`
  );

  const raw = res.values || [];
  if (raw.length < 2) { console.log(JSON.stringify({ rows: [] })); return; }

  const headers = raw[0].map(h => h.toLowerCase().trim());
  const idx = name => headers.indexOf(name);

  const rows = raw.slice(1).map(r => ({
    date:          r[idx('date')]          || '',
    vendor:        r[idx('vendor')]        || '',
    invoiceNumber: r[idx('invoice #')]     || '',
    amount:        parseFloat(r[idx('amount')] || 0),
    currency:      r[idx('currency')]      || 'EUR',
    type:          (r[idx('type')]         || 'expense').toLowerCase(),
    category:      r[idx('category')]      || 'Other',
    fileLink:      r[idx('drive link')]    || '',
  })).filter(r => r.date && !isNaN(r.amount));

  console.log(JSON.stringify({ rows }));
}

main().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1); });
