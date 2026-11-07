/**
 * GET /api/health
 * Returns server liveness status.
 */
const dbStatus = require('../lib/dbStatus');

const getHealth = async (req, res) => {
  const database = (await dbStatus.check()) ? 'ok' : 'down';
  res.status(200).json({
    status: 'ok',
    database,
    service: 'Matha School Exam Manager API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
};

module.exports = { getHealth };
