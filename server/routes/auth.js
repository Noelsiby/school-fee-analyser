const express = require('express');
const router = express.Router();
const { login, me, logout } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login — public
router.post('/login', login);

// GET /api/auth/me — protected
router.get('/me', authenticate, me);

// POST /api/auth/logout — public
router.post('/logout', logout);

module.exports = router;
