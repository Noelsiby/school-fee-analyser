/**
 * prisma.js — the ONE database client for the whole server.
 *
 * The school database (Aiven free plan) allows only a few connections. Every file used to
 * open its own pool, so the running site could use them all up — and then deploys failed
 * ("remaining connection slots are reserved"). Everything now shares this small pool.
 *
 * DB_POOL_SIZE (optional, Render → Environment): connections for the site (default 5).
 */
const { PrismaClient } = require('@prisma/client');

function withPoolLimit(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', String(Number(process.env.DB_POOL_SIZE) || 5));
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '20');
    return u.toString();
  } catch { return url; }
}

const prisma = global.__mathaPrisma || new PrismaClient({ datasources: { db: { url: withPoolLimit(process.env.DATABASE_URL) } } });
global.__mathaPrisma = prisma;

module.exports = prisma;
