require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const healthRouter = require('./routes/health');
const authRouter   = require('./routes/auth');
const adminRouter  = require('./routes/admin');
const notificationsRouter = require('./routes/notifications');
const subjectTeacherRouter = require('./routes/subjectTeacher');
const classTeacherRouter = require('./routes/classTeacher');
const publicRouter       = require('./routes/public');

// Initialize cron jobs
require('./cron');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ─────────────────────────────────────────────────
const cookieParser = require('cookie-parser');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS setup
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [process.env.CLIENT_URL || '*'] 
  : ['http://localhost:5173'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// ── Static: uploaded files (profile pictures, etc.) ───────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ─────────────────────────────────────────────────
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/subject-teacher', subjectTeacherRouter);
app.use('/api/class-teacher', classTeacherRouter);
app.use('/api/public', publicRouter);

// ── Production: serve built React app ──────────────────────────
// In production, Express serves the Vite build output as static files.
// Any route that is NOT /api/* falls back to index.html so that
// React Router handles client-side navigation (including direct URL access).
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '..', 'client', 'dist');

  app.use(express.static(clientDistPath));

  // React Router fallback — must come AFTER all API routes
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
});
