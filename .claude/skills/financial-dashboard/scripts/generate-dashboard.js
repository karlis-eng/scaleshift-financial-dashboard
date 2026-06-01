// Combines Stripe + Upwork + Sheet + Wise data and generates a self-contained HTML dashboard
// Opens the file in the default browser when done
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const expenses   = JSON.parse(process.argv[2] || '{"rows":[]}');
const stripeData = JSON.parse(process.argv[3] || '{"charges":[],"payouts":[]}');
const upworkData = JSON.parse(process.argv[4] || '{"stubbed":true,"transactions":[]}');
const wiseData   = JSON.parse(process.argv[5] || '{"stubbed":true,"transactions":[],"subscriptions":[],"summary":{}}');

// ── Normalise all transactions (server-side, embedded as JSON) ────────────────
const allTransactions = [];
for (const r of expenses.rows) allTransactions.push({ ...r, source: 'Invoice Sheet' });
for (const c of (stripeData.charges || [])) {
  allTransactions.push({
    date: c.date, vendor: c.customer || c.description || 'Stripe Customer',
    amount: c.amount, gross: c.gross, fee: c.fee,
    currency: c.currency, type: 'income', category: 'Revenue',
    source: 'Stripe', fileLink: '', description: c.description,
  });
}
for (const t of (upworkData.transactions || [])) {
  if (t.type === 'income') allTransactions.push({
    date: t.date, vendor: 'Upwork Client', amount: t.amount,
    currency: t.currency, type: 'income', category: 'Revenue',
    source: 'Upwork', fileLink: '', description: t.description,
  });
}
for (const t of (wiseData.transactions || [])) allTransactions.push({ ...t, source: 'Wise' });

const subs = wiseData.subscriptions || [];
const upworkStubbed = upworkData.stubbed;
const wiseStubbed   = !wiseData.transactions || wiseData.transactions.length === 0;
const COLORS = ['#F2721C','#e8a87c','#c45a14','#f5a06a','#7c3d12','#fbd0b0','#a04010','#fce8d4'];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Scaleshift — Financial Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --canvas:#0b0b0f;--surface:#111118;--surface-2:#18181f;
    --border:rgba(255,255,255,0.08);--border-2:rgba(255,255,255,0.04);
    --text-1:#f0eff4;--text-2:#a09eb8;--text-3:#5e5c72;
    --accent:#F2721C;--accent-dim:rgba(242,114,28,0.15);
    --red:#e05a6e;--red-dim:rgba(224,90,110,0.12);
    --green:#4eccc6;--green-dim:rgba(78,204,198,0.12);
    --font:'Outfit',system-ui,sans-serif;
  }
  body{font-family:var(--font);background:var(--canvas);color:var(--text-1);min-height:100vh;-webkit-font-smoothing:antialiased;}
  body::before{content:'';position:fixed;inset:0;z-index:9998;pointer-events:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity:0.025;}
  ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:var(--canvas)}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

  header{padding:24px 40px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;}
  .header-brand{display:flex;align-items:center;gap:12px}
  .header-brand h1{font-size:17px;font-weight:700;letter-spacing:-0.02em}
  .header-logo{width:28px;height:28px;border-radius:6px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;}
  .header-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
  .header-date{font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.04em;text-transform:uppercase;}

  /* Period selector */
  .period-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
  .period-year{display:flex;align-items:center;gap:4px;}
  .year-btn{background:none;border:none;color:var(--text-3);cursor:pointer;font-size:14px;padding:2px 4px;line-height:1;}
  .year-btn:hover{color:var(--text-1);}
  .year-label{font-size:12px;font-weight:600;color:var(--text-2);min-width:36px;text-align:center;}
  .period-divider{width:1px;height:14px;background:var(--border);margin:0 2px;}
  .pill{padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.04em;
    cursor:pointer;border:1px solid var(--border);color:var(--text-3);background:none;transition:all .15s;white-space:nowrap;}
  .pill:hover{color:var(--text-2);border-color:rgba(255,255,255,0.15);}
  .pill.active{background:var(--accent);color:#fff;border-color:var(--accent);}

  /* Tabs */
  .tabs{display:flex;gap:4px;padding:20px 40px 0;border-bottom:1px solid var(--border);}
  .tab{padding:9px 18px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;
    color:var(--text-3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s;}
  .tab:hover{color:var(--text-2)}.tab.active{color:var(--accent);border-bottom-color:var(--accent);}
  .tab-panel{display:none;}.tab-panel.active{display:block;}

  /* KPI grid */
  .kpi-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:24px 40px 0;}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 20px 16px;position:relative;overflow:hidden;}
  .kpi::after{content:'';position:absolute;inset:0;border-radius:12px;background:linear-gradient(135deg,rgba(255,255,255,0.02) 0%,transparent 60%);pointer-events:none;}
  .kpi .label{font-size:10.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:10px;}
  .kpi .value{font-size:22px;font-weight:700;letter-spacing:-0.02em;line-height:1}
  .kpi .value.orange{color:var(--accent)}.kpi .value.neg{color:var(--red)}.kpi .value.green{color:var(--green)}
  .kpi .sub{font-size:11px;color:var(--text-3);margin-top:6px}

  .charts-row{display:grid;grid-template-columns:2fr 1fr;gap:12px;padding:16px 40px 0}
  .charts-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 40px 0}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;}
  .card h2{font-size:10.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:20px;}
  canvas{max-height:240px}
  .stub-badge{display:inline-block;padding:2px 8px;border-radius:4px;background:var(--surface-2);color:var(--text-3);font-size:10px;letter-spacing:0.05em;margin-left:8px;vertical-align:middle;}

  .table-section{padding:12px 40px 48px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;padding:10px 14px;font-size:10.5px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);}
  td{padding:11px 14px;border-bottom:1px solid var(--border-2);color:var(--text-2)}
  tr:hover td{background:var(--surface-2);color:var(--text-1)}
  td:first-child{color:var(--text-3);font-variant-numeric:tabular-nums}
  td.amount{color:var(--text-1);font-weight:600;font-variant-numeric:tabular-nums}td.fee{color:var(--red)}
  .badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;}
  .badge.income{background:var(--accent-dim);color:var(--accent)}.badge.expense{background:var(--red-dim);color:var(--red)}
  .badge.active{background:var(--green-dim);color:var(--green)}.badge.inactive{background:var(--surface-2);color:var(--text-3)}
  a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}

  .sub-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:24px 40px 0;}
  .sub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:16px 40px 0;}
  .sub-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 20px;display:flex;align-items:center;gap:14px;}
  .sub-card.inactive{opacity:0.45}
  .sub-icon{width:38px;height:38px;border-radius:8px;background:var(--surface-2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--text-2);flex-shrink:0;}
  .sub-icon.active-icon{background:var(--accent-dim);color:var(--accent);}
  .sub-info{flex:1;min-width:0}.sub-name{font-size:13px;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .sub-detail{font-size:11px;color:var(--text-3);margin-top:3px;}
  .sub-amount{font-size:14px;font-weight:700;color:var(--text-1);white-space:nowrap;}
  .sub-amount span{font-size:10px;font-weight:500;color:var(--text-3)}
  .empty-state{padding:60px 40px;text-align:center;color:var(--text-3);font-size:13px;}
  .section-header{padding:24px 40px 0;display:flex;align-items:center;justify-content:space-between;}
  .section-header h3{font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-3);}
</style>
</head>
<body>
<header>
  <div class="header-brand">
    <div class="header-logo">S</div>
    <h1>Financial Dashboard</h1>
  </div>
  <div class="header-right">
    <div class="period-bar" id="periodBar"></div>
    <span class="header-date">Generated ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</span>
  </div>
</header>

<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">Overview</div>
  <div class="tab" onclick="switchTab('transactions')">Transactions</div>
  <div class="tab" onclick="switchTab('subscriptions')">Subscriptions<span id="subBadge"></span></div>
</div>

<!-- OVERVIEW TAB -->
<div id="tab-overview" class="tab-panel active">
  <div class="kpi-grid">
    <div class="kpi"><div class="label">Total Income</div><div class="value orange" id="kpi-income">—</div><div class="sub" id="kpi-income-sub"></div></div>
    <div class="kpi"><div class="label">Total Expenses</div><div class="value neg" id="kpi-expenses">—</div><div class="sub" id="kpi-expenses-sub"></div></div>
    <div class="kpi"><div class="label">Net Profit</div><div class="value" id="kpi-profit">—</div><div class="sub">Income minus expenses</div></div>
    <div class="kpi"><div class="label">Stripe Net</div><div class="value orange" id="kpi-stripe">—</div><div class="sub" id="kpi-stripe-sub"></div></div>
    <div class="kpi"><div class="label">Wise Income</div><div class="value" id="kpi-wise">—</div><div class="sub" id="kpi-wise-sub"></div></div>
    <div class="kpi"><div class="label">Subscriptions</div><div class="value" id="kpi-subs">—</div><div class="sub" id="kpi-subs-sub"></div></div>
  </div>
  <div class="charts-row">
    <div class="card"><h2 id="plChartTitle">Monthly P&amp;L</h2><canvas id="plChart"></canvas></div>
    <div class="card"><h2>Income by Source${upworkStubbed ? '<span class="stub-badge">Upwork pending</span>' : ''}</h2><canvas id="sourceChart"></canvas></div>
  </div>
  <div class="charts-row2">
    <div class="card"><h2>Expenses by Category</h2><canvas id="catChart"></canvas></div>
    <div class="card"><h2>Top Vendors by Spend</h2><canvas id="vendorChart"></canvas></div>
  </div>
  <div style="height:40px"></div>
</div>

<!-- TRANSACTIONS TAB -->
<div id="tab-transactions" class="tab-panel">
  <div class="table-section">
    <div class="card">
      <h2 id="txTableTitle">All Transactions</h2><br>
      <table>
        <thead><tr><th>Date</th><th>Vendor / Customer</th><th>Category</th><th>Source</th><th>Gross</th><th>Fee</th><th>Net</th><th>Type</th><th>Link</th></tr></thead>
        <tbody id="txTableBody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- SUBSCRIPTIONS TAB -->
<div id="tab-subscriptions" class="tab-panel">
  <div id="subContent"></div>
</div>

<script>
const ALL_TX   = ${JSON.stringify(allTransactions)};
const ALL_SUBS = ${JSON.stringify(subs)};
const UPWORK_STUBBED = ${upworkStubbed};
const WISE_STUBBED   = ${wiseStubbed};
const COLORS = ${JSON.stringify(COLORS)};
const ACCENT='#F2721C', ACCENT_DIM='rgba(242,114,28,0.2)', TEXT2='#a09eb8', TEXT3='#5e5c72', GRID_C='rgba(255,255,255,0.04)';
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmt  = n => '€' + Number(n).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
const fmtN = n => n >= 0 ? fmt(n) : '-' + fmt(-n);

// ── State ────────────────────────────────────────────────────────────────────
let currentYear  = null;   // null = all time
let currentMonth = null;   // null = full year, 'all' = all time

// All years present in data
const allYears = [...new Set(ALL_TX.filter(t=>t.date).map(t=>t.date.slice(0,4)))].sort();
if (allYears.length) currentYear = allYears[allYears.length - 1];

// ── Charts (initialised once, updated on filter change) ──────────────────────
let plChart, sourceChart, catChart, vendorChart;

function initCharts() {
  const co = { responsive:true, animation:{ duration:300 } };
  plChart = new Chart(document.getElementById('plChart').getContext('2d'), {
    type:'bar', data:{labels:[],datasets:[
      {label:'Income',data:[],backgroundColor:ACCENT,borderRadius:4},
      {label:'Expenses',data:[],backgroundColor:'rgba(224,90,110,0.7)',borderRadius:4}
    ]},
    options:{...co,plugins:{legend:{labels:{color:TEXT2,font:{family:'Outfit',size:12}}}},
      scales:{x:{ticks:{color:TEXT3,font:{family:'Outfit',size:11}},grid:{color:GRID_C}},
              y:{ticks:{color:TEXT3,font:{family:'Outfit',size:11},callback:v=>'€'+v},grid:{color:GRID_C}}}}
  });
  sourceChart = new Chart(document.getElementById('sourceChart').getContext('2d'), {
    type:'doughnut', data:{labels:['Stripe','Wise','Upwork'],datasets:[{data:[0,0,0],
      backgroundColor:[ACCENT,'rgba(78,204,198,0.7)','rgba(255,255,255,0.06)'],borderWidth:0,hoverOffset:6}]},
    options:{...co,cutout:'68%',plugins:{legend:{labels:{color:TEXT2,font:{family:'Outfit',size:12}}}}}
  });
  catChart = new Chart(document.getElementById('catChart').getContext('2d'), {
    type:'doughnut', data:{labels:[],datasets:[{data:[],backgroundColor:COLORS,borderWidth:0,hoverOffset:6}]},
    options:{...co,cutout:'68%',plugins:{legend:{labels:{color:TEXT2,font:{family:'Outfit',size:12}}}}}
  });
  vendorChart = new Chart(document.getElementById('vendorChart').getContext('2d'), {
    type:'bar', data:{labels:[],datasets:[{label:'Spend',data:[],backgroundColor:ACCENT_DIM,borderColor:ACCENT,borderWidth:1,borderRadius:4}]},
    options:{...co,indexAxis:'y',plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:TEXT3,font:{family:'Outfit',size:11},callback:v=>'€'+v},grid:{color:GRID_C}},
              y:{ticks:{color:TEXT2,font:{family:'Outfit',size:11}},grid:{color:GRID_C}}}}
  });
}

// ── Filter transactions ───────────────────────────────────────────────────────
function filterTx() {
  return ALL_TX.filter(t => {
    if (!t.date) return currentYear === null;
    if (currentYear === null) return true;          // all time
    if (!t.date.startsWith(currentYear)) return false;
    if (currentMonth === null) return true;         // full year
    return t.date.slice(5,7) === currentMonth;
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const tx = filterTx();
  const income   = tx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expenses = tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const profit   = income - expenses;

  const stripeIncome = tx.filter(t=>t.source==='Stripe').reduce((s,t)=>s+t.amount,0);
  const stripeFees   = tx.filter(t=>t.source==='Stripe').reduce((s,t)=>s+(t.fee||0),0);
  const wiseIncome   = tx.filter(t=>t.source==='Wise'&&t.type==='income').reduce((s,t)=>s+t.amount,0);
  const upworkIncome = tx.filter(t=>t.source==='Upwork').reduce((s,t)=>s+t.amount,0);
  const stripeCount  = tx.filter(t=>t.source==='Stripe').length;

  // KPIs
  document.getElementById('kpi-income').textContent = fmt(income);
  document.getElementById('kpi-income-sub').textContent = 'All sources';
  document.getElementById('kpi-expenses').textContent = fmt(expenses);
  document.getElementById('kpi-expenses-sub').textContent = tx.filter(t=>t.type==='expense').length + ' invoices';
  const profitEl = document.getElementById('kpi-profit');
  profitEl.textContent = fmtN(profit);
  profitEl.className = 'value ' + (profit >= 0 ? 'orange' : 'neg');
  document.getElementById('kpi-stripe').textContent = fmt(stripeIncome);
  document.getElementById('kpi-stripe-sub').textContent = stripeCount + ' payments · ' + fmt(stripeFees) + ' fees';
  const wiseEl = document.getElementById('kpi-wise');
  wiseEl.textContent = WISE_STUBBED ? '—' : fmt(wiseIncome);
  wiseEl.className = 'value ' + (WISE_STUBBED ? '' : 'green');
  document.getElementById('kpi-wise-sub').textContent = WISE_STUBBED ? 'No transactions yet' : tx.filter(t=>t.source==='Wise'&&t.type==='income').length + ' transfers';

  // Subscriptions KPI (always all-time)
  const activeSubs = ALL_SUBS.filter(s=>s.active);
  const subMonthly = activeSubs.reduce((s,sub)=>s+sub.monthlyAmount,0);
  document.getElementById('kpi-subs').textContent = subMonthly > 0 ? fmt(subMonthly)+'/mo' : '—';
  document.getElementById('kpi-subs').className = 'value ' + (subMonthly > 0 ? 'neg' : '');
  document.getElementById('kpi-subs-sub').textContent = activeSubs.length + ' active · ' + fmt(subMonthly*12) + '/yr est.';

  // P&L chart — monthly if year selected, yearly if all-time
  const isAllTime = currentYear === null;
  const isMonthView = currentMonth !== null;
  if (isMonthView) {
    // Daily breakdown for single month
    const dayMap = {};
    for (const t of tx) {
      const d = t.date;
      if (!dayMap[d]) dayMap[d] = {income:0,expense:0};
      if (t.type==='income') dayMap[d].income += t.amount;
      if (t.type==='expense') dayMap[d].expense += t.amount;
    }
    const days = Object.keys(dayMap).sort();
    plChart.data.labels = days.map(d => d.slice(5));
    plChart.data.datasets[0].data = days.map(d=>dayMap[d].income);
    plChart.data.datasets[1].data = days.map(d=>dayMap[d].expense);
    document.getElementById('plChartTitle').textContent = 'Daily P&L — ' + MONTH_NAMES[parseInt(currentMonth,10)-1] + ' ' + currentYear;
  } else if (isAllTime) {
    // Yearly breakdown
    const yearMap = {};
    for (const t of ALL_TX) {
      if (!t.date) continue;
      const y = t.date.slice(0,4);
      if (!yearMap[y]) yearMap[y] = {income:0,expense:0};
      if (t.type==='income') yearMap[y].income += t.amount;
      if (t.type==='expense') yearMap[y].expense += t.amount;
    }
    const yrs = Object.keys(yearMap).sort();
    plChart.data.labels = yrs;
    plChart.data.datasets[0].data = yrs.map(y=>yearMap[y].income);
    plChart.data.datasets[1].data = yrs.map(y=>yearMap[y].expense);
    document.getElementById('plChartTitle').textContent = 'Yearly P&L';
  } else {
    // Monthly breakdown for selected year
    const monthMap = {};
    for (const t of tx) {
      if (!t.date) continue;
      const m = t.date.slice(5,7);
      if (!monthMap[m]) monthMap[m] = {income:0,expense:0};
      if (t.type==='income') monthMap[m].income += t.amount;
      if (t.type==='expense') monthMap[m].expense += t.amount;
    }
    const ms = Object.keys(monthMap).sort();
    plChart.data.labels = ms.map(m => MONTH_NAMES[parseInt(m,10)-1]);
    plChart.data.datasets[0].data = ms.map(m=>monthMap[m].income);
    plChart.data.datasets[1].data = ms.map(m=>monthMap[m].expense);
    document.getElementById('plChartTitle').textContent = 'Monthly P&L — ' + (currentYear || 'All time');
  }
  plChart.update();

  // Source chart
  sourceChart.data.datasets[0].data = [stripeIncome, wiseIncome || 0.001, upworkIncome || 0.001];
  sourceChart.data.datasets[0].backgroundColor = [ACCENT,'rgba(78,204,198,0.7)', UPWORK_STUBBED ? 'rgba(255,255,255,0.06)' : 'rgba(242,114,28,0.35)'];
  sourceChart.update();

  // Cat chart
  const catMap = {};
  for (const t of tx.filter(t=>t.type==='expense')) catMap[t.category||'Other'] = (catMap[t.category||'Other']||0) + t.amount;
  catChart.data.labels = Object.keys(catMap);
  catChart.data.datasets[0].data = Object.values(catMap);
  catChart.update();

  // Vendor chart
  const vendorMap = {};
  for (const t of tx.filter(t=>t.type==='expense')) vendorMap[t.vendor] = (vendorMap[t.vendor]||0) + t.amount;
  const topV = Object.entries(vendorMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  vendorChart.data.labels = topV.map(v=>v[0]);
  vendorChart.data.datasets[0].data = topV.map(v=>v[1]);
  vendorChart.update();

  // Transactions table
  const sorted = [...tx].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  document.getElementById('txTableTitle').textContent = 'Transactions (' + sorted.length + ')';
  document.getElementById('txTableBody').innerHTML = sorted.map(t => \`
    <tr>
      <td>\${t.date||'—'}</td><td>\${t.vendor||t.description||'—'}</td>
      <td>\${t.category||'—'}</td><td>\${t.source}</td>
      <td class="amount">\${fmt(t.gross||t.amount)}</td>
      <td class="fee">\${t.fee ? '-'+fmt(t.fee) : '—'}</td>
      <td class="amount">\${fmt(t.amount)}</td>
      <td><span class="badge \${t.type}">\${t.type}</span></td>
      <td>\${t.fileLink ? '<a href="'+t.fileLink+'" target="_blank">View</a>' : '—'}</td>
    </tr>\`).join('');
}

// ── Period bar ────────────────────────────────────────────────────────────────
function buildPeriodBar() {
  const bar = document.getElementById('periodBar');
  bar.innerHTML = '';

  // All time pill
  const allPill = document.createElement('button');
  allPill.className = 'pill' + (currentYear === null ? ' active' : '');
  allPill.textContent = 'All time';
  allPill.onclick = () => { currentYear = null; currentMonth = null; buildPeriodBar(); render(); };
  bar.appendChild(allPill);

  if (allYears.length === 0) return;

  const div = document.createElement('div'); div.className = 'period-divider'; bar.appendChild(div);

  // Year navigation
  const yearWrap = document.createElement('div'); yearWrap.className = 'period-year';
  const prevY = document.createElement('button'); prevY.className = 'year-btn'; prevY.textContent = '‹';
  const yearLbl = document.createElement('span'); yearLbl.className = 'year-label'; yearLbl.textContent = currentYear || '';
  const nextY = document.createElement('button'); nextY.className = 'year-btn'; nextY.textContent = '›';
  const yi = allYears.indexOf(currentYear);
  prevY.disabled = yi <= 0; prevY.style.opacity = yi <= 0 ? '0.2' : '1';
  nextY.disabled = yi >= allYears.length-1; nextY.style.opacity = yi >= allYears.length-1 ? '0.2' : '1';
  prevY.onclick = () => { if(yi > 0){ currentYear = allYears[yi-1]; currentMonth = null; buildPeriodBar(); render(); }};
  nextY.onclick = () => { if(yi < allYears.length-1){ currentYear = allYears[yi+1]; currentMonth = null; buildPeriodBar(); render(); }};
  yearWrap.append(prevY, yearLbl, nextY);
  bar.appendChild(yearWrap);

  const div2 = document.createElement('div'); div2.className = 'period-divider'; bar.appendChild(div2);

  // Month pills (only months that have data in selected year)
  const activeMos = [...new Set(ALL_TX.filter(t=>t.date&&t.date.startsWith(currentYear)).map(t=>t.date.slice(5,7)))].sort();
  MONTH_NAMES.forEach((name, i) => {
    const mo = String(i+1).padStart(2,'0');
    if (!activeMos.includes(mo)) return;
    const pill = document.createElement('button');
    pill.className = 'pill' + (currentMonth === mo && currentYear !== null ? ' active' : '');
    pill.textContent = name;
    pill.onclick = () => {
      if (currentMonth === mo && currentYear !== null) { currentMonth = null; }
      else { currentMonth = mo; }
      buildPeriodBar(); render();
    };
    bar.appendChild(pill);
  });
}

// ── Subscriptions tab ─────────────────────────────────────────────────────────
function renderSubs() {
  const activeSubs   = ALL_SUBS.filter(s=>s.active);
  const inactiveSubs = ALL_SUBS.filter(s=>!s.active);
  const subMonthly   = activeSubs.reduce((s,sub)=>s+sub.monthlyAmount,0);
  const subAnnual    = subMonthly * 12;

  // Badge on tab
  document.getElementById('subBadge').innerHTML = activeSubs.length > 0
    ? \` <span style="background:var(--accent);color:#fff;border-radius:10px;padding:1px 6px;font-size:9px;margin-left:4px;">\${activeSubs.length}</span>\` : '';

  if (ALL_SUBS.length === 0) {
    document.getElementById('subContent').innerHTML = \`
      <div class="empty-state">
        <p style="font-size:15px;font-weight:600;color:var(--text-2);margin-bottom:8px;">No subscriptions detected yet</p>
        <p>Subscriptions are auto-detected from your Wise transactions as recurring charges appear each month.</p>
      </div>\`;
    return;
  }

  const subCard = s => \`
    <div class="sub-card \${s.active?'':'inactive'}">
      <div class="sub-icon \${s.active?'active-icon':''}">\${s.vendor.slice(0,1).toUpperCase()}</div>
      <div class="sub-info">
        <div class="sub-name">\${s.vendor}</div>
        <div class="sub-detail">Last charged \${s.lastCharged} · \${s.monthsActive} month\${s.monthsActive!==1?'s':''} tracked</div>
      </div>
      <div>
        <div class="sub-amount">\${fmt(s.monthlyAmount)} <span>/mo</span></div>
        <div style="text-align:right;margin-top:3px;"><span class="badge \${s.active?'active':'inactive'}">\${s.active?'active':'inactive'}</span></div>
      </div>
    </div>\`;

  document.getElementById('subContent').innerHTML = \`
    <div class="sub-kpis">
      <div class="kpi"><div class="label">Monthly Spend</div><div class="value neg">\${fmt(subMonthly)}</div><div class="sub">\${activeSubs.length} active subscriptions</div></div>
      <div class="kpi"><div class="label">Annual Estimate</div><div class="value neg">\${fmt(subAnnual)}</div><div class="sub">Based on current active subs</div></div>
      <div class="kpi"><div class="label">Inactive</div><div class="value">\${inactiveSubs.length}</div><div class="sub">Not charged in last 35 days</div></div>
    </div>
    <div class="section-header" style="margin-top:8px;"><h3>Active (\${activeSubs.length})</h3></div>
    <div class="sub-grid">\${activeSubs.map(subCard).join('')}</div>
    \${inactiveSubs.length > 0 ? \`
    <div class="section-header" style="margin-top:16px;"><h3>Inactive (\${inactiveSubs.length})</h3></div>
    <div class="sub-grid">\${inactiveSubs.map(subCard).join('')}</div>\` : ''}
    <div style="height:40px"></div>\`;
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',['overview','transactions','subscriptions'][i]===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initCharts();
buildPeriodBar();
render();
renderSubs();
</script>
</body>
</html>`;

const outPath = path.join(require('os').tmpdir(), 'scaleshift-dashboard.html');
fs.writeFileSync(outPath, html);
console.log(JSON.stringify({ ok: true, path: outPath }));
try { execSync(`start "" "${outPath}"`); } catch(e) {}
