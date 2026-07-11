const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Ensure upload dirs exist ────────────────────────────────
const profilesDir = path.join(__dirname, '..', 'uploads', 'profiles');
const csvDir      = path.join(__dirname, '..', 'uploads', 'csv');
[profilesDir, csvDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Profile picture storage ──────────────────────────────────
const profileStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, profilesDir),
  filename:    (_, file, cb) => {
    const uid = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `profile-${uid}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const imageFilter = (_, file, cb) => {
  /\.(jpe?g|png|gif|webp)$/i.test(file.originalname)
    ? cb(null, true)
    : cb(new Error('Only image files are allowed (jpg, png, gif, webp)'));
};

// ── CSV storage ─────────────────────────────────────────────
const csvStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, csvDir),
  filename:    (_, __, cb) => cb(null, `import-${Date.now()}.csv`),
});

const csvFilter = (_, file, cb) => {
  /\.csv$/i.test(file.originalname)
    ? cb(null, true)
    : cb(new Error('Only .csv files are allowed'));
};

// ── Exports ─────────────────────────────────────────────────
exports.uploadProfile = multer({
  storage:    profileStorage,
  fileFilter: imageFilter,
  limits:     { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

exports.uploadCSV = multer({
  storage:    csvStorage,
  fileFilter: csvFilter,
  limits:     { fileSize: 2 * 1024 * 1024 }, // 2 MB
});
