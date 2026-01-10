#!/bin/sh
set -e

# ----------------------------- 
# Configurazione DATABASE 
# ----------------------------- 
export DATABASE_URL=${DATABASE_URL} 

# Estrai host, porta, user, password e db dal DATABASE_URL 
DB_HOST=$(echo $DATABASE_URL | sed -E 's#postgresql://[^:]+:[^@]+@([^:/]+).*#\1#') 
DB_PORT=$(echo $DATABASE_URL | sed -E 's#postgresql://[^:]+:[^@]+@[^:]+:([0-9]+).*#\1#') 
DB_USER=$(echo $DATABASE_URL | sed -E 's#postgresql://([^:]+):.*#\1#') 
DB_PASSWORD=$(echo $DATABASE_URL | sed -E 's#postgresql://[^:]+:([^@]+)@.*#\1#') 
DB_NAME=$(echo $DATABASE_URL | sed -E 's#postgresql://[^:]+:[^@]+@[^:]+:[0-9]+/(.*)#\1#') 

export PGUSER=$DB_USER 
export PGPASSWORD=$DB_PASSWORD 
export PGHOST=$DB_HOST 
export PGPORT=$DB_PORT 
export PGDATABASE=$DB_NAME 

echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..." 

# ----------------------------- 
# Loop fino a quando Postgres risponde 
# ----------------------------- 
until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER >/dev/null 2>&1; do
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
