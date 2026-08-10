#!/bin/sh
set -e

echo "▶ Running Prisma migrations..."
npx prisma migrate deploy

echo "▶ Starting Next.js server..."
exec node_modules/.bin/next start -p "${PORT:-3000}"
