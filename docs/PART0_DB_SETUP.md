# Part 0 — Create DB in pgAdmin (do this once)

Your screenshot shows only the default `postgres` database. Create `dmhr_portal`:

1. In pgAdmin, select **Databases** → right-click → **Create** → **Database**
2. **Database** name: `dmhr_portal`
3. **Owner**: `postgres`
4. Save

Or open Query Tool on `postgres` and run:

```sql
CREATE DATABASE dmhr_portal
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       TEMPLATE = template0;
```

Then create `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/dmhr_portal?schema=public"
PORT=4000
NODE_ENV=development
JWT_SECRET="dmhr-dev-secret-change-me-32chars"
CORS_ORIGIN="http://localhost:3000"
```

Replace `YOUR_PASSWORD` with the password you set when installing PostgreSQL.

Tell the agent: **“DB created, .env ready — run migrate and seed”**
