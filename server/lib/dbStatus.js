/**
 * dbStatus.js — knows whether the database can be reached.
 *
 * A quick "SELECT 1" runs every 30 seconds (and on demand). When the database is
 * down, any request that fails is answered with a clear 503 message
 * ("The database can't be reached…") instead of a confusing "Internal server error".
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CHECK_EVERY_MS = 30 * 1000;
const DB_DOWN_MESSAGE =
  "The school database can't be reached right now. " +
  'Please try again in a few minutes. If it keeps happening, the database service needs to be switched on.';

let up = true;
let lastChecked = 0;
let checking = null;

/** Ping the database. Resolves to true when it answers. */
function check() {
  if (!checking) {
    checking = prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false)
      .then((ok) => {
        if (ok !== up) console.log(`[db] database is ${ok ? 'reachable again' : 'NOT reachable'}`);
        up = ok;
        lastChecked = Date.now();
        checking = null;
        return ok;
      });
  }
  return checking;
}

const isUp = () => up;

/** Start the background check (called once at start-up). */
function start() {
  check();
  setInterval(check, CHECK_EVERY_MS).unref();
}

// Prisma's "can't connect" errors, when a controller passes the message through.
const CONNECTION_ERROR = /Can't reach database server|P1001|P1002|P1017|Timed out fetching a new connection|Server has closed the connection/i;

/**
 * Express middleware: if a request ends in a server error while the database is
 * down, send the clear 503 message instead.
 */
function friendlyWhenDown(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500) {
      if (CONNECTION_ERROR.test(String(body?.error || ''))) up = false;
      else if (up) check(); // re-check now so the next request knows
    }
    if (res.statusCode >= 500 && !up) {
      res.status(503);
      return json({ error: DB_DOWN_MESSAGE, code: 'DB_DOWN' });
    }
    return json(body);
  };
  next();
}

/** Size of the database and its biggest tables, for the admin dashboard. */
async function storage() {
  const [{ size }] = await prisma.$queryRaw`SELECT pg_database_size(current_database())::bigint AS size`;
  const tables = await prisma.$queryRaw`
    SELECT relname AS name, pg_total_relation_size(relid)::bigint AS bytes
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 6`;
  return {
    bytes: Number(size),
    tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes) })),
  };
}

module.exports = { start, check, isUp, friendlyWhenDown, storage, DB_DOWN_MESSAGE, lastChecked: () => lastChecked };
