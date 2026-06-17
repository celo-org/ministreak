# ⚠️ DEPRECATED — do not run this service

This standalone Node.js cron oracle has been **retired**. Its job now runs as a
Vercel serverless cron inside the frontend app:

- **Streak scanning/submission:** `frontend/app/api/oracle/route.ts` (hourly)
- **Round resolution/payout:** `frontend/app/api/resolve/route.ts` (hourly, guarded)

Cron schedules live in `frontend/vercel.json`.

## Why it was retired

- Vercel cannot run a persistent `node-cron` process, so this service only ever
  ran on a local machine/VM — it was never part of the deployed app.
- Keeping two oracle implementations risks them diverging. The Vercel routes are
  now the single source of truth.

## Migration notes

- Logic was ported to `frontend/lib/oracle/scanner.ts` and
  `frontend/lib/oracle/submitter.ts`.
- The local SQLite/JSON state (`oracle.json`) is no longer needed — submission
  status is now read directly from the chain via multicall.

This directory is kept in git history only. It is safe to delete once the Vercel
crons are confirmed running in production.
