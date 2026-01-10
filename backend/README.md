# Blue Dream Freediving - Backend API

Backend service for the BlueDream freediving training management system, built with Node.js, Express, PostgreSQL, and Prisma.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcrypt

## Database Schema

### Models

- **User**: System users (athletes and admins)
- **Group**: Training groups (Open, Advanced, Allenamento, Agonistico)
- **UserGroup**: Many-to-many relationship between users and groups
- **EventCategory**: Event types (Corso Open, Corso Advanced, Allenamento)
- **Event**: Individual training events (pre-filled for recurring series)
- **EventSignup**: User signups for events

## Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development only)

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@db:5432/bluedream"
POSTGRES_USER="user"
POSTGRES_PASSWORD="password"
POSTGRES_DB="bluedream"
JWT_SECRET="change-this-to-a-secure-random-string-in-production"
PORT=5000
```

### Quick Start with Docker (Recommended)

Simply run from the project root:

```bash
docker-compose up --build
```

This will automatically:
1. Start PostgreSQL
2. Wait for the database to be healthy
3. Run database migrations
4. Seed the database (first time only)
5. Start the backend server

The server will be available at `http://localhost:5000`

### Local Development (Without Docker)

If you need to run the backend locally:

1. Update `.env` to use localhost:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/bluedream"
```

2. Start only the database:
```bash
docker-compose up -d db
```

3. Install dependencies:
```bash
npm install
```

4. Generate Prisma Client:
```bash
npx prisma generate
```

5. Run migrations:
```bash
npx prisma migrate deploy
```

6. Seed the database:
```bash
node db/seed.js
```

7. Start the server:
```bash
npm start
```

### Initial Data

The seed script creates:
- Event categories: Corso Open, Corso Advanced, Allenamento
- Groups: Open, Advanced, Allenamento, Gruppo Agonistico
- Admin user: `info@freedivingbluedream.it` (password: `admin123`)
- Test user: `user@test.com` (password: `test123`)

## API Documentation

### Authentication

All authenticated endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

### Swagger 

http://localhost:5000/api/docs see swagger documentation

## Database Management

### View Database with Prisma Studio
```bash
npx prisma studio
```

### Create a New Migration
```bash
npx prisma migrate dev --name migration_name
```

### Reset Database
```bash
npx prisma migrate reset
```

### Re-seed Database
```bash
node db/seed.js
```

### Reset Everything (Docker)
To completely reset the database and start fresh:
```bash
docker-compose down -v
docker-compose up --build
```

## Development

### Run in Development Mode
```bash
node server.js
```

### Run with Docker Compose
```bash
docker-compose up
```

This will start both the database and backend services.

## Security Notes

- JWT tokens expire after 7 days
- Passwords are hashed using bcrypt with 10 salt rounds
- Admin-only endpoints are protected with role-based middleware
- Change `JWT_SECRET` in production to a strong random string