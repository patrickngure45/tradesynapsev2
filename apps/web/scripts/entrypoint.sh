#!/bin/sh
set -e

# 1. Run Migrations
echo "📦 Running Database Migrations..."
npm run db:migrate

# 2. Seed Production Data (Assets/Markets)
echo "🌱 Seeding Assets..."
npx tsx scripts/seed-prod.ts

# 3. Ensure Admin User (optional)
echo "👤 Ensuring Admin User..."
npx tsx scripts/seed-admin-prod.ts

# 4. Start Application
echo "🚀 Starting Production Server..."
npm run start:prod
