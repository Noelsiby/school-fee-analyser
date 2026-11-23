
const { DEFAULT_BANDS, parseScale, loadGradeScale, saveGradeScale, passMark } = require('../lib/grades');

const prisma = require('../lib/prisma'); // shared, small pool

const payload = (bands) => ({ bands, outOf: bands[0]?.outOf || 100, passMark: passMark(bands), defaults: DEFAULT_BANDS });

// GET /api/public/grade-scale — anyone (the public results page uses it too)
exports.getGradeScale = async (req, res) => {
  try {
    res.json(payload(await loadGradeScale(prisma)));
  } catch (err) {
    console.error('getGradeScale', err);
    res.status(500).json({ error: 'Could not load the grading scale.' });
  }
};

// PUT /api/admin/grade-scale  { outOf, bands: [{ grade, from, to, points, pass }] }
exports.updateGradeScale = async (req, res) => {
  try {
    const { bands, outOf, error } = parseScale(req.body?.outOf !== undefined ? req.body : req.body?.bands);
    if (error) return res.status(400).json({ error });
    res.json(payload(await saveGradeScale(prisma, bands, outOf)));
  } catch (err) {
    console.error('updateGradeScale', err);
    res.status(500).json({ error: 'Could not save the grading scale.' });
  }
};
