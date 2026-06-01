# ScaleShift — Financial Dashboard

Claude Code skill that generates a live financial dashboard from Stripe, Upwork, Wise, and Google Sheets.

## Structure
```
.claude/skills/financial-dashboard/
  SKILL.md          ← Claude Code skill definition
  scripts/
    fetch-expenses.js
    fetch-stripe.js
    fetch-upwork.js
    fetch-wise.js
    fetch-daily-spend.js
    generate-dashboard.js
    preflight.js
    lib/auth.js
```

## Usage
1. Copy `.claude/skills/` into your Claude Code project root
2. Copy `.env.example` → `.env` and fill in your API keys
3. Run `/financial-dashboard` in Claude Code

## Required env vars
```
GOOGLE_SHEET_ID=
STRIPE_API_KEY=
UPWORK_API_KEY=
WISE_API_TOKEN=
```

Full guide → [scaleshift.io/resources](https://scaleshift.io/resources)
