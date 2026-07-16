const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '8h'; // One school work-day

// ── POST /api/auth/login ──────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // 1. Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        roles: true,
        profilePicUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      // Generic message — don't reveal whether email exists
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 2. Verify password against bcrypt hash
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 3. Sign JWT — include userId, name, email, roles
    const payload = {
      userId: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    // 4. Return user profile (no passwordHash) and set cookie
    const { passwordHash: _, ...safeUser } = user;
    
    res.clearCookie('token');
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    return res.status(200).json({
      user: safeUser,
    });
  } catch (err) {
    console.error('[authController.login]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// ── GET /api/auth/me ─────────────────────────────────────────
// Requires authenticate middleware — req.user is set by it.
const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        profilePicUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({ user });
  } catch (err) {
    console.error('[authController.me]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// ── POST /api/auth/logout ────────────────────────────────────────
const logout = (req, res) => {
  res.clearCookie('token');
  return res.status(200).json({ message: 'Logged out successfully.' });
};

module.exports = { login, me, logout };
