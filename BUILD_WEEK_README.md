# MediQuote Pro — AI Review Loop

> Deterministic healthcare-service costing, challenged by four independent AI perspectives and governed by human decisions.

## Quick start

```bash
npm install
cp .env.example .env
# configure DATABASE_URL and SESSION_SECRET
npm run dev
```

Open `/demo/build-week`. The competition demo uses fictional data, needs no OpenAI key and can be reset at any time.

## Demo path

Need → configuration → calculation → four-reviewer committee → human decisions → absence scenario → contract and operational annex → inconsistency correction → verifiable JSON record.

## Quality commands

```bash
npm test
npm run eval:ai
npx tsc --noEmit
npx eslint src/lib/ai-review src/app/api/ai-review src/components/build-week
npm run build
```

## Architecture

The existing MediQuote deterministic engine is unchanged. The new module consumes a validated `BudgetSnapshot`. Demo logic is deterministic. Optional real reviews use the OpenAI Responses API from a server-only provider with strict JSON Schema, one call per specialist, privacy masking, explicit partial failure, rate limiting and per-user cache isolation.

## Why AI?

AI can surface omissions, relate narrative evidence and present competing interpretations. These are advisory tasks that rigid formulas handle poorly.

## Why deterministic calculation still matters

Money, scenarios, consistency checks, severity gates and hashes must be reproducible. The model never changes a price and never approves.

## Truth and limitations

Read [`docs/build-week/14-implementation-truth-table.md`](docs/build-week/14-implementation-truth-table.md). The real provider is implemented but not live-tested here. Decisions and timeline are session-only in the demo. PDF ingestion and browser E2E screenshots are not implemented. This is not legal advice, a digital signature or a production audit system.

## Branch safety

This work belongs only to `feature/build-week-ai-review-loop`. Do not merge or deploy without an explicit review.
