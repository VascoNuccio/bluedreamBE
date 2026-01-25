# DEPLOY BE
La soluzione completamente gratuita (backend + database)

- Database PostgreSQL su Render (Free)
  creare il db e mettere il file .env con i puntamenti in ./backend poi lanciare i comandi da cmd all'interno della route backend

  npx prisma migrate dev --name init
  npx prisma generate
  node prisma/seed.js

- Backend Node.js + Prisma su Render (Free)
  eseguire il deploy tramite github e dockerfile  del be


# DEPLOY BE SU RAILWAY
NON E' GRATUITO MA PERFORMANTE COSTO 5-20$ AL MESE
Railway → Backend Node.js + Prisma + PostgreSQL (Docker)

🟢 FASE 1 — GitHub

 repo su GitHub aggiornato
 NON committare .env
 .gitignore include .env

🟢 FASE 2 — Railway Project

Vai su https://railway.app
New Project
Deploy from GitHub repo
Seleziona il repository
✔ Railway rileva automaticamente il Dockerfile

🟢 FASE 3 — Aggiungi PostgreSQL

Nel progetto Railway:
Add → Database → PostgreSQL
Attendi provisioning
Railway creerà automaticamente:
DATABASE_URL
network interno sicuro
⚠️ Non copiare a mano user/password

🟢 FASE 4 — Variabili d’ambiente (CRITICO)

Vai su:
Backend Service → Variables
Inserisci:
DATABASE_URL= (già presente se DB collegato)
PORT=5000
JWT_SECRET=supersecretaccesskey123
JWT_REFRESH_SECRET=supersecretrefreshtoken456
CLIENT_URL=https://tuo-frontend.vercel.app
NODE_ENV=production

📌 Nota
Railway fornisce anche un PORT dinamico
Express userà correttamente process.env.PORT

🟢 FASE 5 — Dockerfile (verifica finale)

✔ non usare EXPOSE $PORT

🟢 FASE 6 — Entrypoint (verifica finale)

Deve contenere ESATTAMENTE questo pattern:

parse DATABASE_URL
pg_isready -h host -p port -U user

prisma generate
prisma migrate deploy

seed idempotente

exec "$@"

👉 il tuo script è già corretto

🟢 FASE 7 — Deploy

Railway farà automaticamente:
docker build
docker run
entrypoint
migrate Prisma
avvio server
Controlla i log:

PostgreSQL is ready!
Generating Prisma Client...
Running database migrations...
Seeding database...
Server running on port 5000

✔ se vedi questo → tutto ok

🟢 FASE 8 — Esporre l’API (IMPORTANTISSIMO)

Nel servizio Backend:
Vai su Settings → Networking
Generate Domain
Otterrai qualcosa tipo:
https://my-backend.up.railway.app

📌 Questo è il tuo API BASE URL

🟢 FASE 9 — CORS definitivo (web + mobile)

Nel backend:

app.use(cors({
  origin: [
    process.env.CLIENT_URL,
    'capacitor://localhost',
    'http://localhost',
  ],
  credentials: true,
}));

✔ FE web
✔ App mobile Capacitor
✔ APK sideload

🟢 FASE 10 — Test finale
Test rapidi:

 GET /health → 200 OK
 login / signup funzionano
 cookie / JWT ok
 Prisma legge/scrive DB
 FE comunica con BE
 App mobile comunica con BE

🏁 DONE 🎉

A questo punto hai:
Backend Dockerizzato
Prisma in produzione
PostgreSQL stabile
Web + Mobile compatibili
costo ~0€