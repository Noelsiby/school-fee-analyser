const router = require('express').Router();
const multer = require('multer');
const ctrl = require('../controllers/studentController');
const { authenticate, authorize } = require('../middleware/auth');

// Admin (any class) and Class Teachers (their own class — checked in the controller).
router.use(authenticate, authorize('Admin', 'ClassTeacher'));

// Photos are resized in the browser before upload; 2 MB is plenty.
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => (/^image\/(jpeg|png|webp)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Only JPG, PNG or WEBP photos are allowed.'))),
});
const photoUpload = (req, res, next) => uploadPhoto.single('photo')(req, res, (err) => (
  err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (max 2 MB).' : err.message }) : next()
));

const uploadCSV = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => (/\.csv$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Only .csv files are allowed.'))),
});
const csvUpload = (req, res, next) => uploadCSV.single('csv')(req, res, (err) => (err ? res.status(400).json({ error: err.message }) : next()));

router.get('/class/:classId',                             ctrl.getClassStudents);
router.post('/class/:classId/import', csvUpload,          ctrl.importCSV);
router.get('/class/:classId/exams',                       ctrl.getClassExams);
router.get('/reports/exams/:examId/classes/:classId',     ctrl.getReport);
router.get('/:id',                                        ctrl.getStudent);
router.put('/:id/profile',                                ctrl.updateProfile);
router.get('/:id/photo',                                  ctrl.getPhoto);
router.put('/:id/photo',            photoUpload,          ctrl.uploadPhoto);
router.delete('/:id/photo',                               ctrl.deletePhoto);

module.exports = router;
