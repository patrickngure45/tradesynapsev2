#!/bin/sh
set -e

# 1. Run Migrations
echo "📦 Running Database Migrations..."
npm run db:migrate

# 2. Start Application
echo "🚀 Starting Production Server..."
npm run start:prod
