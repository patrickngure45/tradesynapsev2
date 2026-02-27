# ProofPack (working name)

A Feb-2026 exchange-adjacent project: a P2P safety + evidence + bonded-escrow companion that reduces P2P fraud **without** payment-provider API integrations.

## Start here
- Project handoff (for humans + AIs): `project/HANDOFF.md`
- Demo checklist: `project/DEMO_CHECKLIST.md`
- Option B (exchange) plan: `project/EXCHANGE_PLAN.md`
- Exchange master plan: `project/EXCHANGE_MASTERPLAN.md`
- Security urgent: `project/SECURITY_URGENT.md`
- UI/brand direction: `project/EXCHANGE_UI_BRAND.md`
- Product spec: `project/PRD.md`
- Architecture: `project/ARCHITECTURE.md`
- Threat model: `project/THREAT_MODEL.md`
- Roadmap: `project/ROADMAP.md`

## Model switching (multi-AI workflow)
- Playbook: `project/MODEL_SWITCHING.md`
- Benchmark + assignments: `project/MODEL_BENCHMARK.md`
- Capability matrix (Feb-2026 snapshot): `project/MODEL_CAPABILITY_MATRIX.md`

## Research corpus (durable memory)
- Index: `research/README.md`
- Derived artifacts:
  - `research/derived/p2p_scam_typologies.md`
  - `research/derived/risk_engine_inputs_checklist.md`
  - `research/derived/minimal_schema.md`

## What exists today
This repo contains specs/research notes plus a working MVP codebase.

## MVP code
- Next.js app (TypeScript): `apps/web`
- Database migrations (Postgres): `db/migrations/*.sql`

Quick start (local):
- Create `apps/web/.env.local` (see `apps/web/.env.example`)
- Install + migrate + run:
  - `cd apps/web && npm install`
  - `cd apps/web && npm run db:migrate`
  - `cd apps/web && npm run dev`

## Railway deployment
This project is designed to run on [Railway](https://railway.app) with a Dockerfile. A checklist
for go‑live lives in `apps/web/RAILWAY_GO_LIVE.md` and describes required environment variables,
cron jobs, and security considerations.

To bootstrap a Railway environment:

1. Install the [Railway CLI](https://docs.railway.app/cli) and log in:
   ```bash
   npm install -g railway
   railway login
   ```
2. From the repo root run:
   ```bash
   railway init  # follow prompts to create/link project
   ```
3. Ensure the root directory is `/` and branch is `main` (or your deployment branch).
4. Add a `web` service using `apps/web/Dockerfile` with the start command `npm run start`.
   Create additional services for background workers (outbox‑worker, deposit‑worker)
   using the same Dockerfile and the appropriate npm scripts.
5. Attach a PostgreSQL plugin; Railway will expose `DATABASE_URL` to your services.
6. Populate environment variables according to the checklist and promote shared ones.
7. Add cron schedules in **Settings → Cron Schedule** (see `RAILWAY_GO_LIVE.md` for exact
   endpoints and timing).

A sample `railway.json` is included at the repo root to record service definitions and
can be checked in for team members.

Once set up, pushes to the configured branch will trigger builds/deploys automatically.
Note: `npm run dev` uses webpack by default for reliability on Windows. If you want Turbopack, use `cd apps/web && npm run dev:turbo`.

Offline proof pack verification:
- `cd apps/web && npm run verify:proofpack -- .data/smoke/<trade_id>.zip`

End-to-end smoke test (seed → upload evidence → open dispute → decide → download proof pack → verify):
- `cd apps/web && npm run smoke:proofpack`
