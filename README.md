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

Note: `npm run dev` uses webpack by default for reliability on Windows. If you want Turbopack, use `cd apps/web && npm run dev:turbo`.

Offline proof pack verification:
- `cd apps/web && npm run verify:proofpack -- .data/smoke/<trade_id>.zip`

End-to-end smoke test (seed → upload evidence → open dispute → decide → download proof pack → verify):
- `cd apps/web && npm run smoke:proofpack`
