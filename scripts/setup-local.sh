#!/usr/bin/env bash
# Local environment setup for Soka Scheduling
# Run from project root: ./scripts/setup-local.sh

set -e

echo "==> Installing dependencies..."
npm install

echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Running database migrations..."
npx prisma migrate dev

echo "==> Seeding database..."
npm run db:seed

echo ""
echo "✓ Setup complete! Start the dev server with: npm run dev"
echo "  Then open http://localhost:3000"
echo ""
echo "  Admin login: use ADMIN_EMAIL and ADMIN_PASSWORD from .env"
echo "  (default: admin@soka.edu / admin123)"
