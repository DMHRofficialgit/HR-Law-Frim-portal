# DM.HR Portal — Backend

Express + Prisma + PostgreSQL API.

## Prerequisites

- Node.js 20+
- PostgreSQL running locally (pgAdmin)
- Database named `dmhr_portal`

## Create the database (pgAdmin)

1. Open pgAdmin → connect to PostgreSQL
2. Open Query Tool on the default `postgres` database
3. Run:

```sql
CREATE DATABASE dmhr_portal
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       TEMPLATE = template0;
```

## Setup

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/dmhr_portal?schema=public"
PORT=4000
NODE_ENV=development
JWT_SECRET="change-me-to-a-long-random-string"
CORS_ORIGIN="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
STORAGE_ROOT="./storage"
```

Then:

```bash
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

API: `http://localhost:4000`  
Health: `GET http://localhost:4000/health`

## Seed logins

| Role   | Email                 | Password    |
|--------|-----------------------|-------------|
| Admin  | admin@dmhr.local      | Admin123!   |
| Client | client.a@example.test | Client123!  |
| Client | client.b@example.test | Client123!  |

## Part 1–2 notes

- Client routes never accept `organisationId` from the body — only from JWT.
- Creating an org with `authMode: "invite"` returns `inviteUrl` (share with client).
- Creating with `authMode: "temporary_password"` returns `temporaryPassword` and sets `mustChangePassword`.
- New orgs get six document folders automatically. Files live under `STORAGE_ROOT` (default `./storage`).
- Admin `PATCH /admin/upload-settings` controls allowed extensions, MIME types, and max size.

## Useful commands

```bash
npm run db:studio    # browse data
npm run db:migrate   # new migrations
npm run db:seed      # re-seed (upsert)
```
