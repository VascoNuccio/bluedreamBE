#!/bin/sh
set -e

# ----------------------------- 
# Configurazione DATABASE 
# ----------------------------- 
# Estrai valori da DATABASE_URL in modo più robusto usando psql
export DATABASE_URL=${DATABASE_URL} 

# Loop fino a quando Postgres risponde
echo "Waiting for PostgreSQL at $DATABASE_URL..."
until psql $DATABASE_URL -c '\q' >/dev/null 2>&1; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done


# -----------------------------
# Genera Prisma Client
# -----------------------------
echo "Generating Prisma Client..."
npx prisma generate

# -----------------------------
# Applica migrazioni
# -----------------------------
echo "Running database migrations..."
npx prisma migrate deploy

# -----------------------------
# Seed del database se necessario
# -----------------------------
echo "Seeding database (upsert, quindi sicuro da eseguire più volte)..."
node db/seed.js

echo "Database setup complete!"
echo "Starting server..."

# -----------------------------
# Avvia il backend
# -----------------------------
exec "$@"
