#!/bin/sh
set -e

echo "🔍 Checking database connection..."
until pg_isready -h db -U getprofile > /dev/null 2>&1; do
  echo "⏳ Waiting for database to be ready..."
  sleep 2
done

echo "✅ Database is ready!"
echo ""
echo "🔄 Running database migrations..."
cd /app/packages/db
pnpm drizzle-kit migrate
echo "✅ Migrations completed!"
echo ""

cd /app
echo "🚀 Starting GetProfile Server..."
exec node apps/server/dist/index.js
