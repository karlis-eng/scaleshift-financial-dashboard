/**
 * fetch-wise.js — Fetch transactions from Wise business account
 * Outputs JSON: { transactions, subscriptions, summary }
 */

const https = require("https");

const API_KEY     = process.env.WISE_API_KEY;
const PROFILE_ID  = process.env.WISE_PROFILE_ID  || "87713728";
const ACCOUNT_ID  = process.env.WISE_ACCOUNT_ID  || "156641975";

if (!API_KEY) {
  console.error(JSON.stringify({ error: "WISE_API_KEY not set" }));
  process.exit(1);
}

function get(path) {
  return new Promise((res, rej) => {
    const req = https.request(
      { hostname: "api.wise.com", path,
        headers: { Authorization: "Bearer " + API_KEY } },
      r => {
        let d = "";
        r.on("data", c => d += c);
        r.on("end", () => {
          try { res({ status: r.statusCode, body: JSON.parse(d) }); }
          catch { res({ status: r.statusCode, body: d }); }
        });
      }
    );
    req.on("error", rej);
    req.end();
  });
}

function stripHtml(str) {
  return (str || "").replace(/<[^>]+>/g, "").trim();
}

function parseAmount(str) {
  if (!str) return { value: 0, currency: "EUR" };
  const parts = str.trim().split(" ");
  const value = parseFloat(parts[0].replace(",", "")) || 0;
  const currency = parts[1] || "EUR";
  return { value, currency };
}

// Known subscription vendors (case-insensitive match)
const SUBSCRIPTION_KEYWORDS = [
  "anthropic", "openai", "claude", "notion", "linear", "github", "figma",
  "slack", "zoom", "loom", "adobe", "spotify", "netflix", "apple", "google",
  "microsoft", "dropbox", "canva", "airtable", "zapier", "make", "n8n",
  "instantly", "wispr", "supabase", "tally", "tella", "skool", "zernio",
  "monday", "hubspot", "mailchimp", "calendly", "cal.com", "stripe",
  "cloudflare", "vercel", "modal", "aws", "azure", "gcp", "eleven labs",
  "elevenlabs", "fireflies", "descript"
];

function isSubscriptionVendor(title) {
  const t = title.toLowerCase();
  return SUBSCRIPTION_KEYWORDS.some(k => t.includes(k));
}

async function fetchActivities() {
  // Fetch last 12 months of activities (paginate up to 500)
  const since = encodeURIComponent(
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  );

  let allActivities = [];
  let cursor = null;
  let page = 0;

  while (page < 10) {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const { status, body } = await get(
      `/v1/profiles/${PROFILE_ID}/activities?limit=100${cursorParam}`
    );
    if (status !== 200 || !body.activities) break;

    allActivities = allActivities.concat(body.activities);
    if (!body.cursor || body.activities.length < 100) break;
    cursor = body.cursor;
    page++;
  }

  return allActivities;
}

async function main() {
  const activities = await fetchActivities();

  // Filter to completed transactions only (no CANCELLED, no CARD_CHECK)
  const completed = activities.filter(a =>
    a.status === "COMPLETED" &&
    a.type !== "CARD_CHECK" &&
    a.type !== "CARD_AUTHORIZATION"
  );

  // Parse into normalised transactions
  const transactions = completed.map(a => {
    const title = stripHtml(a.title);
    const amount = parseAmount(a.primaryAmount);
    const isIncoming = a.type === "INCOMING_TRANSFER" || a.type === "BALANCE_DEPOSIT";
    return {
      id:       a.id,
      date:     a.createdOn.slice(0, 10),
      vendor:   title,
      amount:   amount.value,
      currency: amount.currency,
      type:     isIncoming ? "income" : "expense",
      source:   "Wise",
      rawType:  a.type,
    };
  });

  // Detect subscriptions: group expenses by vendor, find those recurring across months
  const vendorByMonth = {};
  for (const tx of transactions.filter(t => t.type === "expense")) {
    const month = tx.date.slice(0, 7);
    if (!vendorByMonth[tx.vendor]) vendorByMonth[tx.vendor] = {};
    if (!vendorByMonth[tx.vendor][month]) vendorByMonth[tx.vendor][month] = [];
    vendorByMonth[tx.vendor][month].push(tx.amount);
  }

  const subscriptions = [];
  for (const [vendor, months] of Object.entries(vendorByMonth)) {
    const monthList = Object.keys(months).sort();
    const isRecurring = monthList.length >= 2 || isSubscriptionVendor(vendor);
    if (!isRecurring) continue;

    const allAmounts = Object.values(months).flat();
    const avgAmount = allAmounts.reduce((a, b) => a + b, 0) / allAmounts.length;
    const lastCharged = monthList[monthList.length - 1];

    // Determine if currently active (charged in last 35 days)
    const lastDate = Object.values(months)[monthList.length - 1];
    const daysSinceLast = (Date.now() - new Date(lastCharged + "-01").getTime()) / (1000 * 60 * 60 * 24);

    subscriptions.push({
      vendor,
      monthlyAmount: Math.round(avgAmount * 100) / 100,
      currency: transactions.find(t => t.vendor === vendor)?.currency || "EUR",
      monthsActive: monthList.length,
      lastCharged,
      active: daysSinceLast <= 35,
    });
  }

  subscriptions.sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  // Summary
  const income   = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const activeSubTotal = subscriptions.filter(s => s.active).reduce((s, sub) => s + sub.monthlyAmount, 0);

  const result = {
    transactions,
    subscriptions,
    summary: {
      totalIncome:   Math.round(income * 100) / 100,
      totalExpenses: Math.round(expenses * 100) / 100,
      netProfit:     Math.round((income - expenses) * 100) / 100,
      activeSubscriptionsMonthly: Math.round(activeSubTotal * 100) / 100,
      activeSubscriptionsCount: subscriptions.filter(s => s.active).length,
      currency: "EUR",
    },
    stubbed: transactions.length === 0,
    message: transactions.length === 0
      ? "No completed transactions yet — account is new. Data will appear as transactions complete."
      : null,
  };

  console.log(JSON.stringify(result));
}

main().catch(e => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
