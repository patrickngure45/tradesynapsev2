#!/bin/sh
set -e

# Railway (and many PaaS) expects the app to bind quickly to $PORT.
# Doing heavy work (seeding) on every boot can cause "Application failed to respond".

: "${RUN_MIGRATIONS:=1}"
: "${RUN_SEED_PROD:=0}"
: "${RUN_SEED_ADMIN:=0}"

if [ "$RUN_MIGRATIONS" = "1" ]; then
	echo "📦 Running Database Migrations..."
	npm run db:migrate
else
	echo "↪️  Skipping migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)"
fi

if [ "$RUN_SEED_PROD" = "1" ]; then
	echo "🌱 Seeding production assets/markets..."
	npx tsx scripts/seed-prod.ts
else
	echo "↪️  Skipping seed-prod (RUN_SEED_PROD=$RUN_SEED_PROD)"
fi

if [ "$RUN_SEED_ADMIN" = "1" ]; then
	echo "👤 Ensuring admin user..."
	npx tsx scripts/seed-admin-prod.ts
else
	echo "↪️  Skipping seed-admin-prod (RUN_SEED_ADMIN=$RUN_SEED_ADMIN)"
fi

echo "🚀 Starting Production Server..."
exec npm run start:prod
