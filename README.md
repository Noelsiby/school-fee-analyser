# Matha School Exam Manager

A full-stack monolith: **React (Vite) frontend** + **Express backend**, served from a single Node.js process in production. PostgreSQL via [Aiven](https://aiven.io), ORM via Prisma, JWT-based role-based access control (RBAC).

---

## Project Structure

```
matha-school-exam-manager/
├── client/                  # React (Vite) frontend
│   ├── src/
│   │   ├── App.jsx
│   │   └── App.css
│   └── vite.config.js       # API proxy → :5000 in dev
├── server/                  # Express backend
│   ├── routes/
│   │   └── health.js        # GET /api/health
│   ├── controllers/
│   │   └── healthController.js
│   ├── middleware/
│   │   ├── auth.js          # JWT verification scaffold
│   │   └── rbac.js          # Role-based access control scaffold
│   ├── prisma/
│   │   └── schema.prisma    # Full data model + migrations
│   ├── index.js             # Express entry point
│   ├── .env.example         # Copy to .env and fill in values
│   └── package.json
├── .gitignore
├── package.json             # Root: concurrently dev, build, start
└── README.md
```

---

## Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- An Aiven PostgreSQL service (free tier available at [aiven.io](https://aiven.io))

---

## Environment Setup

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and fill in:

```env
# Aiven PostgreSQL — copy the "Service URI" from the Aiven console.
# It already includes ?sslmode=require — required for Aiven's managed Postgres.
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# JWT secret — generate with:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="your-strong-secret"

PORT=5000
NODE_ENV=development
```

> **Why `?sslmode=require`?** Aiven's managed PostgreSQL enforces TLS. Without this parameter, the connection will be rejected. The parameter is passed directly through Prisma's connection engine — no extra Prisma config needed.

---

## Local Development (client + server separately)

Install all dependencies:

```bash
npm install                        # root (installs concurrently)
npm install --prefix server        # server dependencies + Prisma
npm install --prefix client        # React + Vite
```

Run database migration (requires DATABASE_URL to be set):

```bash
npm run db:migrate
# or for interactive dev migration with prompts:
npm --prefix server run db:migrate:dev
```

Start both client and server in parallel:

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| React dev server | http://localhost:5173 |
| Express API | http://localhost:5000 |

The Vite dev server proxies `/api/*` to `http://localhost:5000`, so the React app calls `fetch('/api/health')` without any CORS issues.

---

## Production (combined — single URL, single process)

1. **Build the React frontend:**

   ```bash
   npm run build
   # This runs: npm --prefix client run build
   # Output: client/dist/
   ```

2. **Start the Express server in production mode:**

   ```bash
   NODE_ENV=production npm start
   # or: npm --prefix server start (with NODE_ENV already set)
   ```

3. **Open** `http://localhost:5000`

In production:
- Express serves `client/dist` as static files.
- Any route **not** starting with `/api` falls back to `client/dist/index.html` — this makes React Router work on direct URL access and page refresh.
- No CORS headers are needed because client and API are on the same origin.

---

## Database (Prisma)

```bash
# Generate Prisma client after schema changes
npm --prefix server run db:generate

# Create and apply a new migration (dev)
npm --prefix server run db:migrate:dev

# Apply existing migrations (production / CI)
npm --prefix server run db:migrate

# Open Prisma Studio (visual DB browser)
npm run db:studio
```

### Data Model Summary

| Model | Description |
|-------|-------------|
| `User` | Staff accounts with `Role[]` flags (Admin, ClassTeacher, SubjectTeacher) |
| `Class` | School class (e.g. "10-A"), linked to a class teacher |
| `Subject` | Subject belonging to a class |
| `TeacherSubjectAssignment` | 3-way join: teacher × subject × class |
| `Student` | Student record (no login) with roll number |
| `Exam` | Exam event with status lifecycle (Draft → Open → Closed) |
| `ExamSubjectConfig` | Max marks per subject per exam |
| `Mark` | Student mark with approval workflow (Pending → Approved/Rejected) |
| `AuditLog` | Immutable audit trail (JSON old/new value snapshots) |
| `Notification` | In-app notifications per user |

---

## Auth (scaffold)

- **`server/middleware/auth.js`** — verifies JWT Bearer token, attaches `req.user`
- **`server/middleware/rbac.js`** — `requireRole('Admin', 'ClassTeacher')` middleware

Not wired to routes yet — ready for feature development.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server liveness check |

---

## Deploying to Render

This application is configured for easy combined deployment to [Render](https://render.com) using a single Web Service.

1. Go to render.com and sign up (free, no credit card required).
2. Click **"New +" → "Web Service"**.
3. Connect your GitHub account and select your `matha-school-exam-manager` repository.
4. Render will auto-detect the `render.yaml` configuration file.
5. In the Render dashboard during setup, add the following Environment Variables:
   - `DATABASE_URL` = (paste your Aiven connection string here, ensure it has `?sslmode=require`)
   - `JWT_SECRET` = (generate a random 32+ character string)
   - `NODE_ENV` = `production`
   - `PORT` = `5000`
   - `CLIENT_URL` = (e.g. `https://matha-school-exam-manager.onrender.com`)
6. Click **"Create Web Service"**.
7. Wait for the build to complete (the first build typically takes 3-5 minutes).
8. Once complete, your app will be live at the URL provided by Render!

The deployment process runs a combined build script defined in `package.json` that:
- Installs root, client, and server dependencies
- Builds the Vite React frontend
- Generates the Prisma client
- Runs `npx prisma migrate deploy` to ensure your database schema is up to date on Aiven.
