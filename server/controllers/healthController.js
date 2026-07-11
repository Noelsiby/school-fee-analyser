/**
 * GET /api/health
 * Returns server liveness status.
 */
const getHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Matha School Exam Manager API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
};

module.exports = { getHealth };
