#!/bin/sh
set -e

# 1. Run Migrations
echo "📦 Running Database Migrations..."
npm run db:migrate

# 2. Seed Production Data (Assets/Markets)
echo "🌱 Seeding Assets..."
npx tsx scripts/seed-prod.ts

# 3. Initialize Market Data
echo "📊 Checking Market Activity..."
npx tsx scripts/seed-market-maker.ts

# 4. Start Application
echo "🚀 Starting Production Server..."
npm run start:prod
