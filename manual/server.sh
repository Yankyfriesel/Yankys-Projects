#!/bin/sh
# Starts a private copy of the system with made-up data (never the live one) on port 3100.
cd "$(dirname "$0")/.."
export PATH="/c/Program Files/nodejs:$PATH"
export NEXT_DIST_DIR=.next-e2e E2E_RELAXED_RATE_LIMIT=1
export PGLITE_DIR="$(pwd)/data/e2e-pglite" DATABASE_URL=
export APP_URL=http://localhost:3100 PORT=3100
export AUTH_SECRET=manual-only-secret-not-used-anywhere-else-0123456789
export GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= PRIORITY_MODE=fake
export ANTHROPIC_API_KEY=practice-key ANTHROPIC_BASE_URL=http://127.0.0.1:3199
export SEED_OWNER_EMAIL=manager@example.com SEED_OWNER_PASSWORD=e2e-owner-password SEED_OWNER_NAME="Dana Cohen"
rm -rf data/e2e-pglite
pnpm exec next build && pnpm exec next start --port 3100
