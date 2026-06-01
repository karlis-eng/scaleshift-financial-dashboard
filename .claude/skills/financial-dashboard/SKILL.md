---
name: financial-dashboard
description: Generate an interactive financial dashboard showing P&L by month, income from Stripe and Upwork, Wise bank transactions, expense breakdown by category, subscriptions tracker, and full transaction table. Use when reviewing finances, preparing for accounting, or getting a business overview.
allowed-tools: Bash
disable-model-invocation: false
---

You are running the **Financial Dashboard** skill. Scripts are in `c:/Users/leila/Documents/AUTOMATION TEMPLATES/SCALESHIFT WORKFLOWS/.claude/skills/financial-dashboard/scripts/`.

## Supporting Files
- Column schema and API field reference: [reference.md](reference.md)
- Example completed run: [examples/completed-run.md](examples/completed-run.md)

---

## Pre-flight

```bash
node "c:/Users/leila/Documents/AUTOMATION TEMPLATES/SCALESHIFT WORKFLOWS/.claude/skills/financial-dashboard/scripts/preflight.js"
```

- Errors block execution (missing keys, bad auth)
- Warnings are non-fatal (Upwork/Wise not configured = warning only, continue)

---

## Step 1 — Fetch all data sources in parallel

Run all four simultaneously:

```bash
node "c:/Users/leila/Documents/AUTOMATION TEMPLATES/SCALESHIFT WORKFLOWS/.claude/skills/financial-dashboard/scripts/fetch-expenses.js"
node "c:/Users/leila/Documents/AUTOMATION TEMPLATES/SCALESHIFT WORKFLOWS/.claude/skills/financial-dashboard/scripts/fetch-stripe.js"
node "c:/Users/leila/Documents/AUTOMATION TEMPLATES/SCALESHIFT WORKFLOWS/.claude/skills/financial-dashboard/scripts/fetch-upwork.js"
node "c:/Users/leila/Documents/AUTOMATION TEMPLATES/SCALESHIFT WORKFLOWS/.claude/skills/financial-dashboard/scripts/fetch-wise.js"
```

Save each output to a variable. If any required source errors, stop and report.
If Upwork or Wise returns `{ stubbed: true }` or has no transactions, that is expected — continue.

---

## Step 2 — Generate dashboard

Pass all four JSON outputs as arguments:

```bash
node "c:/Users/leila/Documents/AUTOMATION TEMPLATES/SCALESHIFT WORKFLOWS/.claude/skills/financial-dashboard/scripts/generate-dashboard.js" '<expensesJson>' '<stripeJson>' '<upworkJson>' '<wiseJson>'
```

The script writes the HTML to a temp file and opens it in the browser automatically.

---

## Step 3 — Report back

After the browser opens, tell the user:

```
## Financial Dashboard — Generated

**Income (Stripe):** €X,XXX.XX (N payments)
**Income (Wise):** €X,XXX.XX | ⚠️ No transactions yet
**Income (Upwork):** €X,XXX.XX | ⚠️ Upwork not connected
**Total Expenses:** €X,XXX.XX (N invoices)
**Net Profit:** €X,XXX.XX
**Active Subscriptions:** €X/mo (N active)

Dashboard saved to: <path>
```

---

## Rules
- Always run all four fetchers — never skip one even if stubbed.
- Never write or modify the Google Sheet from this skill (read-only).
- If Stripe fetch fails, stop — do not generate a partial dashboard without income data.
- If Sheet fetch fails, generate dashboard with income only and flag it clearly.
- If Wise fetch fails or is empty, continue — show subscriptions tab as empty with a note.
