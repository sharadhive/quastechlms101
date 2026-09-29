#!/bin/sh
set -e

echo "▶ Debug: checking environment variables..."
echo "  DATABASE_URL is: ${DATABASE_URL:+SET}${DATABASE_URL:-NOT SET}"
echo "  NODE_ENV is: ${NODE_ENV:-not set}"
echo "  PORT is: ${PORT:-not set}"
echo "  All env var names:"
env | cut -d= -f1 | sort

if [ -z "$DATABASE_URL" ]; then
  echo "❌ FATAL: DATABASE_URL is not set. Cannot start."
  echo "   Please set DATABASE_URL in Railway Variables tab."
  exit 1
fi

echo "▶ Running Prisma migrations..."
npx prisma migrate deploy

echo "▶ Starting Next.js server..."
exec node_modules/.bin/next start -p "${PORT:-3000}"
